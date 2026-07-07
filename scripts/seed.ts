// Seeds the app by POSTing docs/sample-payload.json through the real ingest
// endpoint, exercising the contract end-to-end. Usage:
//   npm run seed             → seeds with the payload's own date
//   npm run seed -- --today  → overrides the date to today
import { readFileSync } from "node:fs";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const token = process.env.INGEST_TOKEN;
if (!token) {
  console.error("INGEST_TOKEN is not set (expected in .env.local)");
  process.exit(1);
}

const payload = JSON.parse(readFileSync("docs/sample-payload.json", "utf8"));
if (process.argv.includes("--today")) {
  payload.date = new Date().toISOString().slice(0, 10);
}

const res = await fetch(`${appUrl}/api/ingest`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
});

const bodyText = await res.text();
console.log(`${res.status} ${bodyText}`);
if (!res.ok) process.exit(1);
