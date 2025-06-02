import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    const recordings = await sql`
      SELECT 
        id,
        title,
        raw_transcription,
        polished_note,
        multispeaker_output,
        medical_topics,
        is_medical,
        audio_url,
        service_used,
        created_at
      FROM recordings
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    return NextResponse.json({
      success: true,
      recordings: recordings.map((recording) => ({
        ...recording,
        medical_topics:
          typeof recording.medical_topics === "string"
            ? JSON.parse(recording.medical_topics)
            : recording.medical_topics,
      })),
    })
  } catch (error) {
    console.error("Get recordings error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch recordings" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ success: false, error: "Recording ID required" }, { status: 400 })
    }

    await sql`DELETE FROM recordings WHERE id = ${id}`

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete recording error:", error)
    return NextResponse.json({ success: false, error: "Failed to delete recording" }, { status: 500 })
  }
}
