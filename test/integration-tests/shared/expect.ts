import { expect, use } from 'chai'
import { jestSnapshotPlugin } from 'mocha-chai-jest-snapshot'

use(jestSnapshotPlugin())

export { expect }
