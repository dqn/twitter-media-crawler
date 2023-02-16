import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import dayjs from "dayjs";
import "dotenv/config";
import { TwitterApi } from "twitter-api-v2";
import { ReadableStream } from "stream/web";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const accessToken = process.env["ACCESS_TOKEN"];
const targetUserId = process.env["TARGET_USER_ID"];

async function downloadMedia(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  const readableNodeStream = Readable.fromWeb(res.body as ReadableStream<any>);
  readableNodeStream.pipe(createWriteStream(path));
}

async function main() {
  if (accessToken === undefined) {
    throw new Error("access token is required");
  }

  if (targetUserId === undefined) {
    throw new Error("target user id is required");
  }

  const dir = targetUserId;
  await mkdir(dir, { recursive: true });

  const client = new TwitterApi(accessToken).readOnly.v2;
  const timeline = await client.userTimeline(targetUserId, {
    max_results: 100,
    expansions: ["attachments.media_keys"],
    "tweet.fields": ["created_at"],
    "media.fields": ["url"],
  });

  const tasks: Promise<void>[] = [];

  for await (const tweet of timeline) {
    const medias = timeline.includes.medias(tweet);
    const d = dayjs(tweet.created_at);
    const prefix = d.format("YYYY-MM-DD_HH-mm-ss");

    tasks.push(
      ...medias.flatMap((m, i) => {
        if (m.url === undefined) {
          console.warn("url not found");
          console.log(`${prefix}_${i}`, tweet.text);
          return [];
        }

        const [, , , ext] = m.url.split(".");
        const name = `${prefix}_${i}.${ext}`;
        return downloadMedia(m.url, path.join(dir, name));
      })
    );
  }

  await Promise.all(tasks);
}

await main();
