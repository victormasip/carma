// Registers the TS resolve hook for `node --import ./tests/register.mjs`.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./ts-loader.mjs', pathToFileURL('./tests/').href)
