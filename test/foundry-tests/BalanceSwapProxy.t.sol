// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {IPermit2} from 'permit2/src/interfaces/IPermit2.sol';
import {ISignatureTransfer} from 'permit2/src/interfaces/ISignatureTransfer.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {IUniswapV2Factory} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import {UniversalRouter} from '../../contracts/UniversalRouter.sol';
import {BalanceSwapProxy} from '../../contracts/BalanceSwapProxy.sol';
import {IBalanceSwapProxy} from '../../contracts/interfaces/IBalanceSwapProxy.sol';
import {Commands} from '../../contracts/libraries/Commands.sol';
import {RouterParameters} from '../../contracts/types/RouterParameters.sol';
import {MockERC20} from './mock/MockERC20.sol';
import {MockERC20Decimals} from './mock/MockERC20Decimals.sol';
import {SignatureVerification} from 'permit2/src/libraries/SignatureVerification.sol';

// NOTE: permit2/src/PermitErrors.sol is pinned to an exact `pragma solidity 0.8.17;`, which is
// incompatible with this repo's pinned `solc_version = 0.8.26` (foundry.toml) and fails the
// build the moment anything imports it. SignatureVerification.sol (imported above) has a
// permissive `^0.8.17` pragma and compiles fine. These two errors are redeclared locally,
// verbatim from PermitErrors.sol, so their selectors match exactly without importing that file.
error InvalidNonce();
error SignatureExpired(uint256 signatureDeadline);

contract BalanceSwapProxyTest is Test {
    uint256 constant AMOUNT = 1 ether;
    uint256 constant BALANCE = 100000 ether;
    IUniswapV2Factory constant FACTORY = IUniswapV2Factory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
    ERC20 constant WETH9 = ERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IPermit2 constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    uint256 constant OWNER_KEY = 0xA11CE;
    address OWNER;
    address RECIPIENT = address(0x4EC1);

    UniversalRouter router;
    BalanceSwapProxy proxy;
    MockERC20 tokenA;
    MockERC20 tokenB;
    address pairAB;

    function setUp() public {
        vm.createSelectFork(vm.envString('FORK_URL'), 20010000);
        OWNER = vm.addr(OWNER_KEY);

        RouterParameters memory params = RouterParameters({
            permit2: address(PERMIT2),
            weth9: address(WETH9),
            v2Factory: address(FACTORY),
            v3Factory: address(0),
            pairInitCodeHash: bytes32(0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(0),
            permissionsAdapterFactory: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0),
            spokePool: address(0)
        });
        router = new UniversalRouter(params);
        proxy = new BalanceSwapProxy(PERMIT2);

        tokenA = new MockERC20();
        tokenB = new MockERC20();
        if (address(tokenA) > address(tokenB)) (tokenA, tokenB) = (tokenB, tokenA);

        pairAB = FACTORY.createPair(address(tokenA), address(tokenB));
        tokenA.mint(pairAB, 100 ether);
        tokenB.mint(pairAB, 100 ether);
        IUniswapV2Pair(pairAB).sync();

        tokenA.mint(OWNER, BALANCE);
    }

    // ---------- shared helpers ----------

    function _v2Route(address tokenIn_, address tokenOut_, address recipient_)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
        address[] memory path = new address[](2);
        path[0] = tokenIn_;
        path[1] = tokenOut_;
        inputs = new bytes[](1);
        // recipient explicit, amountIn = CONTRACT_BALANCE, payerIsUser = false
        inputs[0] = abi.encode(recipient_, ActionConstants.CONTRACT_BALANCE, 0, path, false, new uint256[](0));
    }

    function _intent(address tokenOut_, address recipient_, uint256 minPriceX36_, uint256 minAmount_)
        internal
        view
        returns (IBalanceSwapProxy.SwapIntent memory)
    {
        return IBalanceSwapProxy.SwapIntent({
            router: address(router),
            tokenOut: tokenOut_,
            recipient: recipient_,
            minPriceX36: minPriceX36_,
            minAmount: minAmount_
        });
    }

    function _expectedOut(uint256 amountIn, address pairAddr, address tokenIn_) internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = IUniswapV2Pair(pairAddr).getReserves();
        (uint256 rin, uint256 rout) =
            tokenIn_ == IUniswapV2Pair(pairAddr).token0() ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        return amountIn * 997 * rout / (rin * 1000 + amountIn * 997);
    }

    // ---------- Mode 2a: direct, ERC20 approval ----------

    function testDirectExecuteSwapsFullBalance() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT); // leave exactly AMOUNT as the "full balance"
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));

        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0.9e36, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();

        assertEq(tokenA.balanceOf(OWNER), 0, 'full balance consumed');
        assertEq(tokenB.balanceOf(RECIPIENT), expectedOut, 'recipient got the output');
        assertEq(tokenA.balanceOf(address(router)), 0, 'no residue in router');
        assertEq(tokenA.balanceOf(address(proxy)), 0, 'no residue in proxy');
    }

    function testDirectRevertsSameToken() public {
        vm.startPrank(OWNER);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenA), RECIPIENT);
        vm.expectRevert(IBalanceSwapProxy.SameToken.selector);
        proxy.execute(
            address(tokenA), _intent(address(tokenA), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();
    }

    function testDirectRevertsZeroBalance() public {
        address broke = address(0xB0B);
        vm.startPrank(broke);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        vm.expectRevert(abi.encodeWithSelector(IBalanceSwapProxy.InsufficientBalance.selector, 0, 0));
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();
    }

    function testDirectRevertsBelowMinAmount() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - 0.01 ether); // leave dust
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        vm.expectRevert(
            abi.encodeWithSelector(IBalanceSwapProxy.InsufficientBalance.selector, 0.01 ether, 0.5 ether)
        );
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0.5 ether), commands, inputs,
            block.timestamp + 1000
        );
        vm.stopPrank();
    }

    /// @dev With amount = 1e18, floor = amount * minPriceX36 / 1e36 = minPriceX36 / 1e18 exactly —
    ///      so minPriceX36 = expectedOut * 1e18 puts the floor at precisely expectedOut.
    function testDirectFloorBoundaryExact() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));

        // floor == expectedOut exactly: passes
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, expectedOut * 1e18, 0), commands, inputs,
            block.timestamp + 1000
        );
        assertEq(tokenB.balanceOf(RECIPIENT), expectedOut);
        vm.stopPrank();
    }

    function testDirectFloorBoundaryRevert() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));

        // floor == expectedOut + 1: reverts
        vm.expectRevert(
            abi.encodeWithSelector(IBalanceSwapProxy.InsufficientOutput.selector, expectedOut, expectedOut + 1)
        );
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, (expectedOut + 1) * 1e18, 0), commands, inputs,
            block.timestamp + 1000
        );
        vm.stopPrank();
    }

    function testDirectFloorDisabled() public {
        // minPriceX36 = 0 skips the check even for an awful price (whole BALANCE into a small pool)
        vm.startPrank(OWNER);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        assertEq(tokenA.balanceOf(OWNER), 0);
        assertGt(tokenB.balanceOf(RECIPIENT), 0);
        vm.stopPrank();
    }

    function testDirectRevertsWithoutApproval() public {
        vm.startPrank(OWNER);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        vm.expectRevert();
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();
    }

    // ---------- Mode 2b: direct, Permit2 allowance ----------

    function testPermit2AllowanceExecuteSwapsFullBalance() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT);
        tokenA.approve(address(PERMIT2), type(uint256).max);
        PERMIT2.approve(address(tokenA), address(proxy), type(uint160).max, type(uint48).max);

        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));

        proxy.executeWithPermit2Allowance(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0.9e36, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();

        assertEq(tokenA.balanceOf(OWNER), 0);
        assertEq(tokenB.balanceOf(RECIPIENT), expectedOut);
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenA.balanceOf(address(proxy)), 0);
    }

    function testPermit2AllowanceRevertsWithoutPermit2Approval() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT);
        tokenA.approve(address(PERMIT2), type(uint256).max);
        // note: no PERMIT2.approve(tokenA, proxy, ...) — the proxy has no allowance
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        vm.expectRevert();
        proxy.executeWithPermit2Allowance(
            address(tokenA), _intent(address(tokenB), RECIPIENT, 0, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();
    }

    // ---------- Mode 1: signed & relayed ----------

    // Deliberately constructed independently of the contract's constants: if the contract's
    // typestring drifts from this canonical encoding, these tests must fail.
    bytes32 constant TEST_TOKEN_PERMISSIONS_TYPEHASH = keccak256('TokenPermissions(address token,uint256 amount)');
    bytes32 constant TEST_SWAP_INTENT_TYPEHASH = keccak256(
        'SwapIntent(bytes32 routeHash,address router,address tokenOut,address recipient,uint256 minPriceX36,uint256 minAmount)'
    );
    bytes32 constant TEST_PERMIT_WITNESS_TYPEHASH = keccak256(
        'PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,SwapIntent witness)SwapIntent(bytes32 routeHash,address router,address tokenOut,address recipient,uint256 minPriceX36,uint256 minAmount)TokenPermissions(address token,uint256 amount)'
    );

    function _permit(address token, uint256 cap, uint256 nonce, uint256 deadline)
        internal
        pure
        returns (ISignatureTransfer.PermitTransferFrom memory)
    {
        return ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: token, amount: cap}),
            nonce: nonce,
            deadline: deadline
        });
    }

    function _signIntent(
        ISignatureTransfer.PermitTransferFrom memory permit,
        IBalanceSwapProxy.SwapIntent memory intent,
        bytes memory commands,
        bytes[] memory inputs,
        uint256 privateKey
    ) internal view returns (bytes memory sig) {
        bytes32 witness = keccak256(
            abi.encode(
                TEST_SWAP_INTENT_TYPEHASH,
                keccak256(abi.encode(commands, inputs)),
                intent.router,
                intent.tokenOut,
                intent.recipient,
                intent.minPriceX36,
                intent.minAmount
            )
        );
        bytes32 tokenPermissions = keccak256(abi.encode(TEST_TOKEN_PERMISSIONS_TYPEHASH, permit.permitted));
        bytes32 digest = keccak256(
            abi.encodePacked(
                '\x19\x01',
                PERMIT2.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        TEST_PERMIT_WITNESS_TYPEHASH,
                        tokenPermissions,
                        address(proxy), // spender is bound to the proxy
                        permit.nonce,
                        permit.deadline,
                        witness
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        sig = abi.encodePacked(r, s, v);
    }

    /// @dev Owner signs at "bridge time" with a loose cap; balance is lower than the cap at fill.
    function testSignedExecutePullsBalanceBelowCap() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT); // "bridge delivered" AMOUNT
        tokenA.approve(address(PERMIT2), type(uint256).max); // one-time ERC20 -> Permit2 approval
        vm.stopPrank();

        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        IBalanceSwapProxy.SwapIntent memory intent = _intent(address(tokenB), RECIPIENT, 0.9e36, 0);
        ISignatureTransfer.PermitTransferFrom memory permit =
            _permit(address(tokenA), type(uint256).max, 1, block.timestamp + 1000);
        bytes memory sig = _signIntent(permit, intent, commands, inputs, OWNER_KEY);
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));

        // relayed by an arbitrary third party
        vm.prank(address(0xF177E4));
        proxy.executeWithSig(permit, sig, OWNER, intent, commands, inputs);

        assertEq(tokenA.balanceOf(OWNER), 0, 'full balance pulled');
        assertEq(tokenB.balanceOf(RECIPIENT), expectedOut, 'output at signed recipient');
        assertEq(tokenA.balanceOf(address(router)), 0, 'no residue');
        assertEq(tokenA.balanceOf(address(proxy)), 0, 'proxy never custodies');
    }

    /// @dev Balance above the signed cap: pull is capped, excess stays with the owner.
    function testSignedExecutePullsCapBelowBalance() public {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - 2 ether); // owner holds 2 ether
        tokenA.approve(address(PERMIT2), type(uint256).max);
        vm.stopPrank();

        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        IBalanceSwapProxy.SwapIntent memory intent = _intent(address(tokenB), RECIPIENT, 0.9e36, 0);
        ISignatureTransfer.PermitTransferFrom memory permit =
            _permit(address(tokenA), AMOUNT, 2, block.timestamp + 1000); // cap = 1 ether
        bytes memory sig = _signIntent(permit, intent, commands, inputs, OWNER_KEY);

        vm.prank(address(0xF177E4));
        proxy.executeWithSig(permit, sig, OWNER, intent, commands, inputs);

        assertEq(tokenA.balanceOf(OWNER), 1 ether, 'excess above cap untouched');
        assertGt(tokenB.balanceOf(RECIPIENT), 0);
    }

    // ---------- Mode 1: adversarial relayer, replay, dust-grief, retry ----------

    /// @dev Signs a default intent over the canonical A->B route. Returns everything a test
    ///      needs to execute or tamper.
    function _signedFixture(uint256 cap, uint256 minAmount, uint256 nonce)
        internal
        returns (
            ISignatureTransfer.PermitTransferFrom memory permit,
            IBalanceSwapProxy.SwapIntent memory intent,
            bytes memory commands,
            bytes[] memory inputs,
            bytes memory sig
        )
    {
        vm.startPrank(OWNER);
        tokenA.transfer(address(0xDEAD), BALANCE - AMOUNT);
        tokenA.approve(address(PERMIT2), type(uint256).max);
        vm.stopPrank();

        (commands, inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        intent = _intent(address(tokenB), RECIPIENT, 0.9e36, minAmount);
        permit = _permit(address(tokenA), cap, nonce, block.timestamp + 1000);
        sig = _signIntent(permit, intent, commands, inputs, OWNER_KEY);
    }

    function testSignedRevertsOnTamperedCommands() public {
        (ISignatureTransfer.PermitTransferFrom memory permit, IBalanceSwapProxy.SwapIntent memory intent,,
            bytes[] memory inputs, bytes memory sig) = _signedFixture(type(uint256).max, 0, 10);

        // relayer swaps in a different (valid-looking) command byte
        bytes memory tampered = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_OUT)));
        vm.expectRevert(SignatureVerification.InvalidSigner.selector);
        proxy.executeWithSig(permit, sig, OWNER, intent, tampered, inputs);
    }

    function testSignedRevertsOnTamperedInputs() public {
        (ISignatureTransfer.PermitTransferFrom memory permit, IBalanceSwapProxy.SwapIntent memory intent,
            bytes memory commands, bytes[] memory inputs, bytes memory sig) = _signedFixture(type(uint256).max, 0, 11);

        // relayer redirects the swap output to themselves
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        inputs[0] = abi.encode(address(0xBAD), ActionConstants.CONTRACT_BALANCE, 0, path, false, new uint256[](0));
        vm.expectRevert(SignatureVerification.InvalidSigner.selector);
        proxy.executeWithSig(permit, sig, OWNER, intent, commands, inputs);
    }

    function testSignedRevertsOnTamperedIntentFields() public {
        (ISignatureTransfer.PermitTransferFrom memory permit, IBalanceSwapProxy.SwapIntent memory intent,
            bytes memory commands, bytes[] memory inputs, bytes memory sig) =
            _signedFixture(type(uint256).max, 0.1 ether, 12);

        IBalanceSwapProxy.SwapIntent memory tampered;

        // lower the floor
        tampered = intent;
        tampered.minPriceX36 = 1;
        vm.expectRevert(SignatureVerification.InvalidSigner.selector);
        proxy.executeWithSig(permit, sig, OWNER, tampered, commands, inputs);

        // change the recipient
        tampered = intent;
        tampered.recipient = address(0xBAD);
        vm.expectRevert(SignatureVerification.InvalidSigner.selector);
        proxy.executeWithSig(permit, sig, OWNER, tampered, commands, inputs);

        // change the router
        tampered = intent;
        tampered.router = address(0xBAD);
        vm.expectRevert(SignatureVerification.InvalidSigner.selector);
        proxy.executeWithSig(permit, sig, OWNER, tampered, commands, inputs);

        // drop the minAmount gate (fixture signs minAmount = 0.1 ether so this tamper changes the hash)
        tampered = intent;
        tampered.minAmount = 0;
        vm.expectRevert(SignatureVerification.InvalidSigner.selector);
        proxy.executeWithSig(permit, sig, OWNER, tampered, commands, inputs);
    }

    function testSignedRevertsOnWrongSigner() public {
        (ISignatureTransfer.PermitTransferFrom memory permit, IBalanceSwapProxy.SwapIntent memory intent,
            bytes memory commands, bytes[] memory inputs,) = _signedFixture(type(uint256).max, 0, 13);

        bytes memory wrongSig = _signIntent(permit, intent, commands, inputs, 0xBEE1); // not OWNER_KEY
        vm.expectRevert(SignatureVerification.InvalidSigner.selector);
        proxy.executeWithSig(permit, wrongSig, OWNER, intent, commands, inputs);
    }

    function testSignedRevertsOnWrongOwner() public {
        (ISignatureTransfer.PermitTransferFrom memory permit, IBalanceSwapProxy.SwapIntent memory intent,
            bytes memory commands, bytes[] memory inputs, bytes memory sig) = _signedFixture(type(uint256).max, 0, 17);

        // a different address with a balance (so _resolveAmount passes and Permit2 verification is reached)
        address notTheSigner = address(0xDA2E);
        tokenA.mint(notTheSigner, AMOUNT);
        vm.expectRevert(SignatureVerification.InvalidSigner.selector);
        proxy.executeWithSig(permit, sig, notTheSigner, intent, commands, inputs);
    }

    /// @dev Signer contradiction: cap below minAmount can never execute — the capped amount fails the gate.
    function testSignedRevertsWhenCapBelowMinAmount() public {
        (ISignatureTransfer.PermitTransferFrom memory permit, IBalanceSwapProxy.SwapIntent memory intent,
            bytes memory commands, bytes[] memory inputs, bytes memory sig) =
            _signedFixture(0.1 ether, 0.5 ether, 18); // cap 0.1, minAmount 0.5; OWNER holds 1 ether

        vm.expectRevert(
            abi.encodeWithSelector(IBalanceSwapProxy.InsufficientBalance.selector, 0.1 ether, 0.5 ether)
        );
        proxy.executeWithSig(permit, sig, OWNER, intent, commands, inputs);
    }

    function testSignedRevertsOnReplay() public {
        (ISignatureTransfer.PermitTransferFrom memory permit, IBalanceSwapProxy.SwapIntent memory intent,
            bytes memory commands, bytes[] memory inputs, bytes memory sig) = _signedFixture(type(uint256).max, 0, 14);

        proxy.executeWithSig(permit, sig, OWNER, intent, commands, inputs);

        // refill and replay the same signature
        tokenA.mint(OWNER, AMOUNT);
        vm.expectRevert(InvalidNonce.selector);
        proxy.executeWithSig(permit, sig, OWNER, intent, commands, inputs);
    }

    function testSignedRevertsOnExpiredDeadline() public {
        (ISignatureTransfer.PermitTransferFrom memory permit, IBalanceSwapProxy.SwapIntent memory intent,
            bytes memory commands, bytes[] memory inputs, bytes memory sig) = _signedFixture(type(uint256).max, 0, 15);

        vm.warp(block.timestamp + 2000); // past permit.deadline
        vm.expectRevert(abi.encodeWithSelector(SignatureExpired.selector, permit.deadline));
        proxy.executeWithSig(permit, sig, OWNER, intent, commands, inputs);
    }

    /// @dev The dust-grief story: attacker donates dust pre-fill; minAmount blocks execution and
    ///      preserves the nonce; the real fill then executes with the same signature.
    function testSignedDustGriefBlockedByMinAmount() public {
        // fresh user with zero balance ("bridge hasn't filled yet")
        uint256 userKey = 0xB0B2;
        address user = vm.addr(userKey);
        vm.prank(user);
        tokenA.approve(address(PERMIT2), type(uint256).max);

        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        IBalanceSwapProxy.SwapIntent memory intent = _intent(address(tokenB), RECIPIENT, 0.9e36, 0.5 ether);
        ISignatureTransfer.PermitTransferFrom memory permit =
            _permit(address(tokenA), type(uint256).max, 99, block.timestamp + 1000);
        bytes memory sig = _signIntent(permit, intent, commands, inputs, userKey);

        // attacker donates dust and tries to burn the intent
        tokenA.mint(user, 0.01 ether);
        vm.prank(address(0xA77AC4E4));
        vm.expectRevert(
            abi.encodeWithSelector(IBalanceSwapProxy.InsufficientBalance.selector, 0.01 ether, 0.5 ether)
        );
        proxy.executeWithSig(permit, sig, user, intent, commands, inputs);

        // the bridge fills; the SAME signature now executes
        tokenA.mint(user, AMOUNT);
        vm.prank(address(0xF177E4));
        proxy.executeWithSig(permit, sig, user, intent, commands, inputs);
        assertEq(tokenA.balanceOf(user), 0);
        assertGt(tokenB.balanceOf(RECIPIENT), 0);
    }

    /// @dev A floor-revert consumes nothing; the same signature succeeds after the price improves.
    function testSignedFloorRevertPreservesSignature() public {
        (ISignatureTransfer.PermitTransferFrom memory permit,, bytes memory commands, bytes[] memory inputs,) =
            _signedFixture(type(uint256).max, 0, 16);

        // sign a floor just above the currently-achievable rate
        uint256 expectedOut = _expectedOut(AMOUNT, pairAB, address(tokenA));
        IBalanceSwapProxy.SwapIntent memory intent =
            _intent(address(tokenB), RECIPIENT, (expectedOut + 2) * 1e18, 0);
        bytes memory sig = _signIntent(permit, intent, commands, inputs, OWNER_KEY);

        vm.expectRevert(); // InsufficientOutput
        proxy.executeWithSig(permit, sig, OWNER, intent, commands, inputs);
        assertEq(tokenA.balanceOf(OWNER), AMOUNT, 'pull unwound atomically');

        // pool price improves (one-sided tokenB donation + sync raises the A->B rate)
        tokenB.mint(pairAB, 10 ether);
        IUniswapV2Pair(pairAB).sync();

        proxy.executeWithSig(permit, sig, OWNER, intent, commands, inputs);
        assertEq(tokenA.balanceOf(OWNER), 0, 'same signature executed after retry');
    }

    // ---------- floor arithmetic ----------

    /// @dev 6-dec in, 18-dec out: unit price 1.0 => base-unit rate 1e12 => minPriceX36 ~ 1e48.
    ///      Proves the X36 width expresses extreme decimal asymmetry.
    function testFloorAcrossDecimalAsymmetry() public {
        MockERC20Decimals usdc = new MockERC20Decimals(6);
        address pairU = FACTORY.createPair(address(usdc), address(tokenB));
        usdc.mint(pairU, 100e6);
        tokenB.mint(pairU, 100 ether);
        IUniswapV2Pair(pairU).sync();

        address user = address(0x6DEC);
        vm.startPrank(user);
        usdc.mint(user, 1e6); // 1 USDC
        usdc.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(usdc), address(tokenB), RECIPIENT);

        // floor = 1e6 * 0.9e48 / 1e36 = 0.9e18 — 0.9 tokenB out per 1 USDC in
        proxy.execute(
            address(usdc), _intent(address(tokenB), RECIPIENT, 0.9e48, 0), commands, inputs, block.timestamp + 1000
        );
        vm.stopPrank();
        assertGt(tokenB.balanceOf(RECIPIENT), 0.9e18);
    }

    function testFloorOverflowReverts() public {
        vm.startPrank(OWNER);
        tokenA.approve(address(proxy), type(uint256).max);
        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        // BALANCE * uint256.max overflows in _checkOutput -> arithmetic panic, not a wrap
        vm.expectRevert(stdError.arithmeticError);
        proxy.execute(
            address(tokenA), _intent(address(tokenB), RECIPIENT, type(uint256).max, 0), commands, inputs,
            block.timestamp + 1000
        );
        vm.stopPrank();
    }

    // ---------- residue invariant ----------

    /// @dev After any successful signed execution, neither the proxy nor the router holds
    ///      any of either token. Fuzzed over the delivered amount.
    function testFuzzSignedNoResidue(uint256 amount) public {
        amount = bound(amount, 1e6, 50 ether);

        uint256 userKey = 0xFA22;
        address user = vm.addr(userKey);
        vm.startPrank(user);
        tokenA.approve(address(PERMIT2), type(uint256).max);
        vm.stopPrank();
        tokenA.mint(user, amount);

        (bytes memory commands, bytes[] memory inputs) = _v2Route(address(tokenA), address(tokenB), RECIPIENT);
        IBalanceSwapProxy.SwapIntent memory intent = _intent(address(tokenB), RECIPIENT, 0, 0);
        ISignatureTransfer.PermitTransferFrom memory permit =
            _permit(address(tokenA), type(uint256).max, amount, block.timestamp + 1000); // nonce = amount (unique per run)
        bytes memory sig = _signIntent(permit, intent, commands, inputs, userKey);

        proxy.executeWithSig(permit, sig, user, intent, commands, inputs);

        assertEq(tokenA.balanceOf(user), 0);
        assertEq(tokenA.balanceOf(address(proxy)), 0);
        assertEq(tokenB.balanceOf(address(proxy)), 0);
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenB.balanceOf(address(router)), 0);
        assertGt(tokenB.balanceOf(RECIPIENT), 0);
    }
}
