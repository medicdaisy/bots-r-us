import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get("audio") as File

    if (!audioFile) {
      return NextResponse.json(
        {
          success: false,
          error: "No audio file received",
        },
        { status: 400 },
      )
    }

    // Log file details for debugging
    console.log("Test upload received:", {
      name: audioFile.name,
      size: audioFile.size,
      type: audioFile.type,
    })

    // Read first few bytes to verify it's a valid file
    const buffer = await audioFile.arrayBuffer()
    const firstBytes = new Uint8Array(buffer.slice(0, 16))

    return NextResponse.json({
      success: true,
      fileInfo: {
        name: audioFile.name,
        size: audioFile.size,
        type: audioFile.type,
        firstBytes: Array.from(firstBytes),
      },
      message: "File upload test successful",
    })
  } catch (error) {
    console.error("Test upload error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
