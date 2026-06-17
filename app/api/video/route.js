// Dedicated video route — serves the MP4 with proper range request support
// for iOS Safari, which requires range requests for video autoplay
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request) {
  const videoPath = path.join(process.cwd(), "images", "Rushmore", "RushMORE (1).mp4");

  try {
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      // iOS Safari requires range request support for video
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const stream = fs.createReadStream(videoPath, { start, end });
      const headers = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize.toString(),
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=31536000",
      };

      return new NextResponse(stream, { status: 206, headers });
    } else {
      // Full file
      const stream = fs.createReadStream(videoPath);
      const headers = {
        "Content-Length": fileSize.toString(),
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000",
      };
      return new NextResponse(stream, { status: 200, headers });
    }
  } catch (err) {
    return new NextResponse("Video not found", { status: 404 });
  }
}
