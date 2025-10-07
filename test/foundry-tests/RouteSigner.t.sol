// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import 'forge-std/Test.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {RouteSigner} from '../../contracts/base/RouteSigner.sol';
import {IUniversalRouter} from '../../contracts/interfaces/IUniversalRouter.sol';
import {Lock} from '../../contracts/base/Lock.sol';
import {Constants} from '../../contracts/libraries/Constants.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';

contract ContextCapture {
    UniversalRouter public router;
    address public capturedSigner;
    bytes32 public capturedIntent;
    bytes32 public capturedData;

    constructor(UniversalRouter _router) {
        router = _router;
    }

    // This function will be called during execution and will try to read the signed context
    function captureContext() external payable {
        (capturedSigner, capturedIntent, capturedData) = router.signedRouteContext();
    }

    receive() external payable {
        // Capture context when receiving ETH
        (capturedSigner, capturedIntent, capturedData) = router.signedRouteContext();
    }
}

contract ReentrantMaliciousContract {
    UniversalRouter public router;

    constructor(UniversalRouter _router) {
        router = _router;
    }

    receive() external payable {
        // Try to reenter executeSigned with arbitrary params
        // This should revert due to isNotLocked modifier
        bytes memory commands = abi.encodePacked(bytes1(0x00));
        bytes[] memory inputs = new bytes[](0);

        router.executeSigned{value: 0}(
            commands, inputs, bytes32(0), bytes32(0), false, bytes32(0), hex'', block.timestamp + 1000
        );
    }
}

contract RouteSignerTest is Test {
    uint256 constant AMOUNT = 10 ** 18;

    UniversalRouter router;
    ContextCapture capturer;

    // Signer for EIP712 signatures
    address signer;
    uint256 signerPrivateKey;

    function setUp() public {
        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            v2Factory: address(0),
            v3Factory: address(0),
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0)
        });
        router = new UniversalRouter(params);
        capturer = new ContextCapture(router);

        (signer, signerPrivateKey) = makeAddrAndKey('signer');
    }

    function getDomainSeparator() internal view returns (bytes32) {
        return getDomainSeparatorFor(router);
    }

    function getDomainSeparatorFor(UniversalRouter _router) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
                keccak256(bytes('UniversalRouter')),
                keccak256(bytes('2')),
                block.chainid,
                address(_router)
            )
        );
    }

    function signExecution(
        bytes memory commands,
        bytes[] memory inputs,
        bytes32 intent,
        bytes32 data,
        address sender,
        bytes32 nonce,
        uint256 deadline
    ) internal view returns (bytes memory signature) {
        bytes32 EXECUTE_SIGNED_TYPEHASH = keccak256(
            'ExecuteSigned(bytes commands,bytes[] inputs,bytes32 intent,bytes32 data,address sender,bytes32 nonce,uint256 deadline)'
        );

        // Hash inputs array per EIP712
        bytes32[] memory inputHashes = new bytes32[](inputs.length);
        for (uint256 i = 0; i < inputs.length; i++) {
            inputHashes[i] = keccak256(inputs[i]);
        }
        bytes32 inputsHash = keccak256(abi.encodePacked(inputHashes));

        // Create struct hash
        bytes32 structHash = keccak256(
            abi.encode(EXECUTE_SIGNED_TYPEHASH, keccak256(commands), inputsHash, intent, data, sender, nonce, deadline)
        );

        // Get domain separator
        bytes32 domainSeparator = getDomainSeparator();

        // Create digest
        bytes32 digest = keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));

        // Sign
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function testExecuteSigned() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('nonce1');
        uint256 deadline = block.timestamp + 1000;

        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, nonce, signature, deadline);

        // Verify context was captured correctly during execution
        address expectedSigner = signer;
        assertEq(capturer.capturedSigner(), expectedSigner, 'Signer mismatch during execution');
        assertEq(capturer.capturedIntent(), intent, 'Intent mismatch during execution');
        assertEq(capturer.capturedData(), data, 'Data mismatch during execution');

        // Verify nonce was marked as used
        assertTrue(router.noncesUsed(expectedSigner, nonce), 'Nonce should be marked as used');

        // Verify context was cleared after execution
        (address storedSigner, bytes32 storedIntent, bytes32 storedData) = router.signedRouteContext();
        assertEq(storedSigner, address(0), 'Signer should be cleared after execution');
        assertEq(storedIntent, bytes32(0), 'Intent should be cleared after execution');
        assertEq(storedData, bytes32(0), 'Data should be cleared after execution');
    }

    function testExecuteSignedWrongSender() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('nonce2');
        uint256 deadline = block.timestamp + 1000;

        // Sign with address(this) as sender
        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Try to call from a different address
        address alice = makeAddr('alice');
        vm.deal(alice, AMOUNT);
        vm.prank(alice);

        // Won't revert but will recover wrong signer
        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, nonce, signature, deadline);

        // Verify the recovered signer is NOT the expected signer
        address expectedSigner = signer;
        assertTrue(capturer.capturedSigner() != expectedSigner, 'Signer should not match when called from wrong sender');

        // But intent and data should still be stored correctly
        assertEq(capturer.capturedIntent(), intent, 'Intent should match');
        assertEq(capturer.capturedData(), data, 'Data should match');
    }

    function testExecuteSignedNoSenderVerification() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('nonce3');
        uint256 deadline = block.timestamp + 1000;

        // Sign with address(0) as sender (no sender verification)
        bytes memory signature = signExecution(commands, inputs, intent, data, address(0), nonce, deadline);

        // Call from a different address
        address bob = makeAddr('bob');
        vm.deal(bob, AMOUNT);
        vm.prank(bob);

        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, false, nonce, signature, deadline);

        // Verify context was captured correctly during execution
        address expectedSigner = signer;
        assertEq(capturer.capturedSigner(), expectedSigner, 'Signer mismatch during execution');
        assertEq(capturer.capturedIntent(), intent, 'Intent mismatch during execution');
        assertEq(capturer.capturedData(), data, 'Data mismatch during execution');
    }

    function testExecuteSignedMultipleCommands() public {
        // Create 3 transfer commands
        bytes memory commands = abi.encodePacked(
            bytes1(uint8(Commands.TRANSFER)), bytes1(uint8(Commands.TRANSFER)), bytes1(uint8(Commands.TRANSFER))
        );

        address recipient1 = makeAddr('recipient1');
        address recipient2 = makeAddr('recipient2');

        bytes[] memory inputs = new bytes[](3);
        inputs[0] = abi.encode(Constants.ETH, recipient1, AMOUNT / 3);
        inputs[1] = abi.encode(Constants.ETH, address(capturer), AMOUNT / 3); // This will trigger receive() and capture context
        inputs[2] = abi.encode(Constants.ETH, recipient2, AMOUNT / 3);

        bytes32 intent = keccak256('multi-command-intent');
        bytes32 data = keccak256('multi-command-data');
        bytes32 nonce = keccak256('nonce4');
        uint256 deadline = block.timestamp + 1000;

        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, nonce, signature, deadline);

        // Verify context was captured correctly during execution (from the second command)
        address expectedSigner = signer;
        assertEq(capturer.capturedSigner(), expectedSigner, 'Signer mismatch during multi-command execution');
        assertEq(capturer.capturedIntent(), intent, 'Intent mismatch during multi-command execution');
        assertEq(capturer.capturedData(), data, 'Data mismatch during multi-command execution');

        // Verify all transfers happened
        assertEq(recipient1.balance, AMOUNT / 3, 'Recipient1 should have received ETH');
        assertEq(recipient2.balance, AMOUNT / 3, 'Recipient2 should have received ETH');

        // Verify context was cleared after execution
        (address storedSigner, bytes32 storedIntent, bytes32 storedData) = router.signedRouteContext();
        assertEq(storedSigner, address(0), 'Signer should be cleared after execution');
        assertEq(storedIntent, bytes32(0), 'Intent should be cleared after execution');
        assertEq(storedData, bytes32(0), 'Data should be cleared after execution');
    }

    function testNonceReplayProtection() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('replay-nonce');
        uint256 deadline = block.timestamp + 1000;

        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // First execution should succeed
        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, nonce, signature, deadline);

        // Second execution with same nonce should revert
        vm.expectRevert(RouteSigner.NonceAlreadyUsed.selector);
        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, nonce, signature, deadline);
    }

    function testOptionalNonce() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 optionalNonce = bytes32(type(uint256).max); // Sentinel value to skip nonce check
        uint256 deadline = block.timestamp + 1000;

        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), optionalNonce, deadline);

        address expectedSigner = signer;

        // First execution should succeed
        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, optionalNonce, signature, deadline);

        // Verify nonce was NOT marked as used
        assertFalse(router.noncesUsed(expectedSigner, optionalNonce), 'Optional nonce should not be marked as used');

        // Second execution with same signature should also succeed (no replay protection)
        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, optionalNonce, signature, deadline);
    }

    function testExpiredDeadline() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('deadline-nonce');
        uint256 deadline = block.timestamp - 1; // Deadline in the past

        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Should revert with TransactionDeadlinePassed
        vm.expectRevert(IUniversalRouter.TransactionDeadlinePassed.selector);
        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, nonce, signature, deadline);
    }

    function testInvalidSignature() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('invalid-sig-nonce');
        uint256 deadline = block.timestamp + 1000;

        // Create a completely invalid signature
        bytes memory invalidSignature = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));

        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, false, nonce, invalidSignature, deadline);

        // Verify the recovered signer is NOT the expected signer
        address expectedSigner = signer;
        assertTrue(capturer.capturedSigner() != expectedSigner, 'Invalid signature should recover different signer');
    }

    function testTamperedCommands() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('tampered-commands-nonce');
        uint256 deadline = block.timestamp + 1000;

        // Sign with original commands
        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Tamper with commands - use TRANSFER with allow revert flag
        bytes memory tamperedCommands =
            abi.encodePacked(bytes1(uint8(Commands.TRANSFER) | uint8(Commands.FLAG_ALLOW_REVERT)));

        router.executeSigned{value: AMOUNT}(tamperedCommands, inputs, intent, data, false, nonce, signature, deadline);

        // Verify the recovered signer is NOT the expected signer
        address expectedSigner = signer;
        assertTrue(capturer.capturedSigner() != expectedSigner, 'Tampered commands should recover different signer');
    }

    function testTamperedInputs() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('tampered-inputs-nonce');
        uint256 deadline = block.timestamp + 1000;

        // Sign with original inputs
        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Tamper with inputs - change recipient
        address differentRecipient = makeAddr('differentRecipient');
        bytes[] memory tamperedInputs = new bytes[](1);
        tamperedInputs[0] = abi.encode(Constants.ETH, differentRecipient, AMOUNT);

        router.executeSigned{value: AMOUNT}(commands, tamperedInputs, intent, data, false, nonce, signature, deadline);

        // Verify the recovered signer is NOT the expected signer
        address expectedSigner = signer;
        assertTrue(capturer.capturedSigner() != expectedSigner, 'Tampered inputs should recover different signer');
    }

    function testTamperedIntent() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('tampered-intent-nonce');
        uint256 deadline = block.timestamp + 1000;

        // Sign with original intent
        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Tamper with intent
        bytes32 tamperedIntent = keccak256('different-intent');

        router.executeSigned{value: AMOUNT}(commands, inputs, tamperedIntent, data, false, nonce, signature, deadline);

        // Verify the recovered signer is NOT the expected signer
        address expectedSigner = signer;
        assertTrue(capturer.capturedSigner() != expectedSigner, 'Tampered intent should recover different signer');
    }

    function testTamperedData() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('tampered-data-nonce');
        uint256 deadline = block.timestamp + 1000;

        // Sign with original data
        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Tamper with data
        bytes32 tamperedData = keccak256('different-data');

        router.executeSigned{value: AMOUNT}(commands, inputs, intent, tamperedData, false, nonce, signature, deadline);

        // Verify the recovered signer is NOT the expected signer
        address expectedSigner = signer;
        assertTrue(capturer.capturedSigner() != expectedSigner, 'Tampered data should recover different signer');
    }

    function testTamperedNonce() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('original-nonce');
        uint256 deadline = block.timestamp + 1000;

        // Sign with original nonce
        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Tamper with nonce
        bytes32 tamperedNonce = keccak256('tampered-nonce');

        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, false, tamperedNonce, signature, deadline);

        // Verify the recovered signer is NOT the expected signer
        address expectedSigner = signer;
        assertTrue(capturer.capturedSigner() != expectedSigner, 'Tampered nonce should recover different signer');
    }

    function testWrongDeadlineMismatch() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('deadline-mismatch-nonce');
        uint256 deadline = block.timestamp + 1000;

        // Sign with one deadline
        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Call with different deadline
        uint256 differentDeadline = block.timestamp + 2000;

        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, false, nonce, signature, differentDeadline);

        // Verify the recovered signer is NOT the expected signer
        address expectedSigner = signer;
        assertTrue(capturer.capturedSigner() != expectedSigner, 'Wrong deadline should recover different signer');
    }

    function testRegularExecuteHasNoContext() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT);

        // Execute using regular execute() (not executeSigned)
        router.execute{value: AMOUNT}(commands, inputs, block.timestamp + 1000);

        // Verify no context was captured during execution
        assertEq(capturer.capturedSigner(), address(0), 'Signer should be zero during regular execute');
        assertEq(capturer.capturedIntent(), bytes32(0), 'Intent should be zero during regular execute');
        assertEq(capturer.capturedData(), bytes32(0), 'Data should be zero during regular execute');

        // Verify context is still zero after execution
        (address storedSigner, bytes32 storedIntent, bytes32 storedData) = router.signedRouteContext();
        assertEq(storedSigner, address(0), 'Signer should be zero after regular execute');
        assertEq(storedIntent, bytes32(0), 'Intent should be zero after regular execute');
        assertEq(storedData, bytes32(0), 'Data should be zero after regular execute');
    }

    function testNestedExecuteSubPlanPreservesContext() public {
        // Create a sub-plan that transfers to the capturer contract (which will capture context)
        bytes memory subCommands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory subInputs = new bytes[](1);
        subInputs[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT / 2);

        // Create main commands with EXECUTE_SUB_PLAN
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.EXECUTE_SUB_PLAN)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(subCommands, subInputs);

        bytes32 intent = keccak256('nested-intent');
        bytes32 data = keccak256('nested-data');
        bytes32 nonce = keccak256('nested-nonce');
        uint256 deadline = block.timestamp + 1000;

        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, nonce, signature, deadline);

        // Verify context was preserved during nested execution
        address expectedSigner = signer;
        assertEq(capturer.capturedSigner(), expectedSigner, 'Signer should be preserved in nested execution');
        assertEq(capturer.capturedIntent(), intent, 'Intent should be preserved in nested execution');
        assertEq(capturer.capturedData(), data, 'Data should be preserved in nested execution');

        // Verify context was cleared after execution
        (address storedSigner, bytes32 storedIntent, bytes32 storedData) = router.signedRouteContext();
        assertEq(storedSigner, address(0), 'Signer should be cleared after execution');
        assertEq(storedIntent, bytes32(0), 'Intent should be cleared after execution');
        assertEq(storedData, bytes32(0), 'Data should be cleared after execution');
    }

    function testContextNotLeakedBetweenTransactions() public {
        // First transaction - signed execution
        bytes memory commands1 = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs1 = new bytes[](1);
        inputs1[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT / 2);

        bytes32 intent1 = keccak256('intent1');
        bytes32 data1 = keccak256('data1');
        bytes32 nonce1 = keccak256('nonce-tx1');
        uint256 deadline1 = block.timestamp + 1000;

        bytes memory signature1 = signExecution(commands1, inputs1, intent1, data1, address(this), nonce1, deadline1);

        router.executeSigned{value: AMOUNT / 2}(commands1, inputs1, intent1, data1, true, nonce1, signature1, deadline1);

        // Verify first transaction context
        address expectedSigner = signer;
        assertEq(capturer.capturedSigner(), expectedSigner, 'First transaction should capture signer');
        assertEq(capturer.capturedIntent(), intent1, 'First transaction should capture intent1');
        assertEq(capturer.capturedData(), data1, 'First transaction should capture data1');

        // Verify context was cleared after first transaction
        (address storedSigner, bytes32 storedIntent, bytes32 storedData) = router.signedRouteContext();
        assertEq(storedSigner, address(0), 'Context should be cleared between transactions');
        assertEq(storedIntent, bytes32(0), 'Intent should be cleared between transactions');
        assertEq(storedData, bytes32(0), 'Data should be cleared between transactions');

        // Second transaction - different signed execution
        bytes memory commands2 = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs2 = new bytes[](1);
        inputs2[0] = abi.encode(Constants.ETH, address(capturer), AMOUNT / 2);

        bytes32 intent2 = keccak256('intent2');
        bytes32 data2 = keccak256('data2');
        bytes32 nonce2 = keccak256('nonce-tx2');
        uint256 deadline2 = block.timestamp + 1000;

        bytes memory signature2 = signExecution(commands2, inputs2, intent2, data2, address(this), nonce2, deadline2);

        router.executeSigned{value: AMOUNT / 2}(commands2, inputs2, intent2, data2, true, nonce2, signature2, deadline2);

        // Verify second transaction has its own context (not leaked from first)
        assertEq(capturer.capturedSigner(), expectedSigner, 'Second transaction should capture signer');
        assertEq(capturer.capturedIntent(), intent2, 'Second transaction should capture intent2 (not intent1)');
        assertEq(capturer.capturedData(), data2, 'Second transaction should capture data2 (not data1)');

        // Verify context was cleared after second transaction
        (storedSigner, storedIntent, storedData) = router.signedRouteContext();
        assertEq(storedSigner, address(0), 'Context should be cleared after second transaction');
        assertEq(storedIntent, bytes32(0), 'Intent should be cleared after second transaction');
        assertEq(storedData, bytes32(0), 'Data should be cleared after second transaction');
    }

    function testDifferentContractAddresses() public {
        // Deploy a second router
        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            v2Factory: address(0),
            v3Factory: address(0),
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0)
        });
        UniversalRouter router2 = new UniversalRouter(params);

        // Deploy a context capture contract for router2
        ContextCapture capturer2 = new ContextCapture(router2);

        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(capturer2), AMOUNT);

        bytes32 intent = keccak256('intent');
        bytes32 data = keccak256('data');
        bytes32 nonce = keccak256('different-contract-nonce');
        uint256 deadline = block.timestamp + 1000;

        // Sign for router1 (uses router1's address in domain separator)
        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Try to execute on router2 with signature for router1
        router2.executeSigned{value: AMOUNT}(commands, inputs, intent, data, false, nonce, signature, deadline);

        // Verify the recovered signer is NOT the expected signer (because domain separator is different)
        address expectedSigner = signer;
        assertTrue(capturer2.capturedSigner() != expectedSigner, 'Signature should not be valid for different contract');
    }

    function testReentrantMaliciousContract() public {
        // Deploy malicious contract
        ReentrantMaliciousContract malicious = new ReentrantMaliciousContract(router);

        // Create commands that transfer to the malicious contract
        bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.TRANSFER)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(Constants.ETH, address(malicious), AMOUNT);

        bytes32 intent = keccak256('reentry-intent');
        bytes32 data = keccak256('reentry-data');
        bytes32 nonce = keccak256('reentry-nonce');
        uint256 deadline = block.timestamp + 1000;

        bytes memory signature = signExecution(commands, inputs, intent, data, address(this), nonce, deadline);

        // Expect revert - malicious contract's reentry attempt will fail and cause ETH transfer to fail
        // (The reentry fails due to invalid signature, which happens before isNotLocked check)
        vm.expectRevert('ETH_TRANSFER_FAILED');
        router.executeSigned{value: AMOUNT}(commands, inputs, intent, data, true, nonce, signature, deadline);
    }
}
