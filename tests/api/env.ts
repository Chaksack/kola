import 'dotenv/config'

// API tests use TEST_DATABASE_URL when set, so they never write into the dev database.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
