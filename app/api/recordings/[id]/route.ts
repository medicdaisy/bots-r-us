import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

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
      WHERE id = ${id}
    `

    if (recordings.length === 0) {
      return NextResponse.json({ success: false, error: "Recording not found" }, { status: 404 })
    }

    const recording = recordings[0]
    return NextResponse.json({
      success: true,
      recording: {
        ...recording,
        medical_topics:
          typeof recording.medical_topics === "string"
            ? JSON.parse(recording.medical_topics)
            : recording.medical_topics,
      },
    })
  } catch (error) {
    console.error("Get recording error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch recording" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { title, raw_transcription, polished_note, multispeaker_output } = body

    await sql`
      UPDATE recordings 
      SET 
        title = ${title},
        raw_transcription = ${raw_transcription},
        polished_note = ${polished_note},
        multispeaker_output = ${multispeaker_output},
        updated_at = NOW()
      WHERE id = ${id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update recording error:", error)
    return NextResponse.json({ success: false, error: "Failed to update recording" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    await sql`DELETE FROM recordings WHERE id = ${id}`

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete recording error:", error)
    return NextResponse.json({ success: false, error: "Failed to delete recording" }, { status: 500 })
  }
}
