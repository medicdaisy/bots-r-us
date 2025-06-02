import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get("audio") as File
    const transcriptionDataStr = formData.get("transcriptionData") as string

    if (!audioFile || !transcriptionDataStr) {
      return NextResponse.json({ success: false, error: "Missing audio file or transcription data" }, { status: 400 })
    }

    const transcriptionData = JSON.parse(transcriptionDataStr)
    const timestamp = Date.now()
    const audioFileName = `recordings/${timestamp}-${audioFile.name || "recording.webm"}`

    // Upload audio to Vercel Blob
    const audioBuffer = await audioFile.arrayBuffer()
    const audioBlob = await put(audioFileName, audioBuffer, {
      access: "public",
      contentType: audioFile.type || "audio/webm",
    })

    // Extract title from polished note or use default
    let title = "Untitled Recording"
    if (transcriptionData.polishedNote) {
      const lines = transcriptionData.polishedNote.split("\n").map((l: string) => l.trim())
      for (const line of lines) {
        if (line.startsWith("#")) {
          const extractedTitle = line.replace(/^#+\s+/, "").trim()
          if (extractedTitle) {
            title = extractedTitle
            break
          }
        }
      }

      if (title === "Untitled Recording") {
        for (const line of lines) {
          if (line.length > 0) {
            let potentialTitle = line.replace(/^[*_`#\->\s[\](.\d)]+/, "")
            potentialTitle = potentialTitle.replace(/[*_`#]+$/, "")
            potentialTitle = potentialTitle.trim()

            if (potentialTitle.length > 3) {
              const maxLength = 60
              title = potentialTitle.substring(0, maxLength) + (potentialTitle.length > maxLength ? "..." : "")
              break
            }
          }
        }
      }
    }

    // Save to Neon database
    const result = await sql`
      INSERT INTO recordings (
        title,
        raw_transcription,
        polished_note,
        multispeaker_output,
        medical_topics,
        is_medical,
        audio_url,
        service_used,
        created_at
      ) VALUES (
        ${title},
        ${transcriptionData.rawTranscription || ""},
        ${transcriptionData.polishedNote || ""},
        ${transcriptionData.multiSpeakerOutput || ""},
        ${JSON.stringify(transcriptionData.medicalTopics || [])},
        ${(transcriptionData.medicalTopics && transcriptionData.medicalTopics.length > 0) || false},
        ${audioBlob.url},
        ${transcriptionData.service || "gemini"},
        NOW()
      )
      RETURNING id
    `

    return NextResponse.json({
      success: true,
      recordingId: result[0].id,
      audioUrl: audioBlob.url,
      title,
    })
  } catch (error) {
    console.error("Save recording error:", error)
    return NextResponse.json({ success: false, error: "Failed to save recording" }, { status: 500 })
  }
}
