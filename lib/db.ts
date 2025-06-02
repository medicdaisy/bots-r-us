import { neon } from "@neondatabase/serverless"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set")
}
const sql = neon(process.env.DATABASE_URL)

interface PartialTranscriptArgs {
  sessionId: string
  chunkIndex: number
  startTimeSec: number
  transcript: string | null // Transcript can be null if STT fails for a chunk
  sttModel: string
}

/**
 * Insert a partial transcript chunk.
 * Table: partial_transcripts (session_id, chunk_index, start_time_sec, transcript, stt_model, created_at)
 */
export async function insertPartialTranscript({
  sessionId,
  chunkIndex,
  startTimeSec,
  transcript,
  sttModel,
}: PartialTranscriptArgs): Promise<void> {
  try {
    await sql`
      INSERT INTO partial_transcripts(session_id, chunk_index, start_time_sec, transcript, stt_model)
      VALUES(${sessionId}, ${chunkIndex}, ${startTimeSec}, ${transcript}, ${sttModel})
    `
  } catch (error) {
    console.error("Error inserting partial transcript:", error)
    throw new Error(`Failed to insert partial transcript: ${error instanceof Error ? error.message : String(error)}`)
  }
}

interface FullTranscriptArgs {
  sessionId: string
  fullTranscript: string | null // Full transcript can be null
  sttModel: string
  diarizationEnabled: boolean
}

/**
 * Insert the final full transcript.
 * Table: full_transcripts (session_id, full_text, stt_model, diarization_enabled, created_at, updated_at)
 */
export async function insertFullTranscript({
  sessionId,
  fullTranscript,
  sttModel,
  diarizationEnabled,
}: FullTranscriptArgs): Promise<void> {
  try {
    await sql`
      INSERT INTO full_transcripts(session_id, full_text, stt_model, diarization_enabled, updated_at)
      VALUES(${sessionId}, ${fullTranscript}, ${sttModel}, ${diarizationEnabled}, NOW())
      ON CONFLICT (session_id) 
      DO UPDATE SET 
        full_text = EXCLUDED.full_text,
        stt_model = EXCLUDED.stt_model,
        diarization_enabled = EXCLUDED.diarization_enabled,
        updated_at = NOW()
    `
  } catch (error) {
    console.error("Error inserting full transcript:", error)
    throw new Error(`Failed to insert full transcript: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Helper to retrieve all partial transcripts for a session, ordered by chunk_index
interface PartialTranscript {
  session_id: string
  chunk_index: number
  start_time_sec: number
  transcript: string | null
  stt_model: string
  created_at: Date
}

export async function getPartialTranscriptsForSession(sessionId: string): Promise<PartialTranscript[]> {
  try {
    const result = await sql<PartialTranscript[]>`
      SELECT session_id, chunk_index, start_time_sec, transcript, stt_model, created_at
      FROM partial_transcripts
      WHERE session_id = ${sessionId}
      ORDER BY chunk_index ASC
    `
    return result
  } catch (error) {
    console.error("Error fetching partial transcripts:", error)
    throw new Error(`Failed to fetch partial transcripts: ${error instanceof Error ? error.message : String(error)}`)
  }
}
