// vitest.setup.ts
import '@testing-library/jest-dom'
import { expect } from 'vitest'
import * as matchers from 'vitest-axe/matchers'
import 'vitest-axe/extend-expect'

expect.extend(matchers)
// import 'whatwg-fetch' // Uncomment if fetch is needed in tests
