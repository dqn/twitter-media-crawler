import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import dayjs from "dayjs";
import { TwitterApi } from "twitter-api-v2";
import "dotenv/config";

const appKey = process.env["APP_KEY"];
const appSecret = process.env["APP_SECRET"];
const accessToken = process.env["ACCESS_TOKEN"];
const accessSecret = process.env["ACCESS_SECRET"];
const targetUserId = process.env["TARGET_USER_ID"];

async function downloadMedia(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  const readableNodeStream = Readable.fromWeb(res.body as ReadableStream<any>);
  readableNodeStream.pipe(createWriteStream(path));
}

async function main() {
  if (appKey === undefined) {
    throw new Error("app key is required");
  }

  if (appSecret === undefined) {
    throw new Error("app secret is required");
  }

  if (accessToken === undefined) {
    throw new Error("access token is required");
  }

  if (accessSecret === undefined) {
    throw new Error("access secret is required");
  }

  if (targetUserId === undefined) {
    throw new Error("target user id is required");
  }

  const dir = targetUserId;
  await mkdir(dir, { recursive: true });

  const client = new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });

  const timeline = await client.readOnly.v1.userTimeline(targetUserId, {
    count: 100,
    trim_user: true,
    include_rts: false,
  });

  const tasks: Promise<void>[] = [];

  for await (const tweet of timeline) {
    const media = tweet.extended_entities?.media;

    if (media === undefined) {
      continue;
    }

    const d = dayjs(tweet.created_at);
    const prefix = d.format("YYYY-MM-DD_HH-mm-ss");

    tasks.push(
      ...media.map((m, i) => {
        if (m.video_info === undefined) {
          // image
          const url = m.media_url_https;
          const [, , , ext] = url.split(".");
          const name = `${prefix}_${i}.${ext}`;
          return downloadMedia(url, path.join(dir, name));
        } else {
          // video
          let bitrate = 0;
          let url: undefined | string = undefined;

          for (const v of m.video_info.variants) {
            if (v.bitrate > bitrate) {
              url = v.url;
            }
          }

          if (url === undefined) {
            throw new Error("video url could not found");
          }

          const name = `${prefix}_${i}.mp4`;
          return downloadMedia(url, path.join(dir, name));
        }
      })
    );
  }

  await Promise.all(tasks);
}

await main();
