import { getCurrentSchemaVersion } from '../db.js'

console.log(`Migrations complete. Current schema version: ${getCurrentSchemaVersion()}`)
