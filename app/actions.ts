"use server"

import { GoogleGenerativeAI } from "@google/generative-ai"
import { put, list, del } from "@vercel/blob"

const MODEL_NAME = "gemini-1.5-flash"

let genAI: GoogleGenerativeAI | null = null

function initializeGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured")
    }
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

export async function transcribeAudio(base64Audio: string, mimeType: string, enableMultiSpeaker = false) {
  try {
    const genAI = initializeGenAI()

    let prompt = "Generate a complete, detailed transcript of this audio."

    if (enableMultiSpeaker) {
      prompt = `Generate a complete, detailed transcript of this audio with speaker identification. 
      Format the output as:
      
      Speaker 1: [their dialogue]
      Speaker 2: [their dialogue]
      
      If you can identify different speakers, label them as Speaker 1, Speaker 2, etc. 
      If there's only one speaker, just use Speaker 1.
      Include timestamps if possible in the format [MM:SS].`
    }

    const model = genAI.getGenerativeModel({ model: MODEL_NAME })

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Audio,
        },
      },
    ])

    const response = await result.response
    const transcriptionText = response.text()

    if (!transcriptionText) {
      throw new Error("Transcription failed or returned empty")
    }

    return {
      success: true,
      transcription: transcriptionText,
    }
  } catch (error) {
    console.error("Error in transcribeAudio:", error)

    // Better error handling for API issues
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        return {
          success: false,
          error: "Invalid API key. Please check your Gemini API key configuration.",
        }
      }
      if (error.message.includes("quota") || error.message.includes("limit")) {
        return {
          success: false,
          error: "API quota exceeded. Please try again later.",
        }
      }
      if (error.message.includes("Request En")) {
        return {
          success: false,
          error: "API authentication failed. Please verify your API key.",
        }
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

export async function polishNote(rawTranscription: string, enableMedicalTopics = false) {
  try {
    if (!rawTranscription || rawTranscription.trim() === "") {
      throw new Error("No transcription provided to polish")
    }

    const genAI = initializeGenAI()

    let prompt = `Take this raw transcription and create a polished, well-formatted note.
                    Remove filler words (um, uh, like), repetitions, and false starts.
                    Format any lists or bullet points properly. Use markdown formatting for headings, lists, etc.
                    Maintain all the original content and meaning.`

    if (enableMedicalTopics) {
      prompt += `
      
      MEDICAL CONTEXT ANALYSIS:
      Since this appears to be medical content, please also:
      1. Identify and highlight any medical terms, conditions, or procedures mentioned
      2. Organize content into relevant medical sections (e.g., Chief Complaint, History, Assessment, Plan)
      3. Flag any critical information that might need immediate attention
      4. Use proper medical terminology and formatting
      5. Add a "Medical Topics Detected" section at the end listing key medical concepts mentioned
      
      Format medical terms in **bold** and use appropriate medical documentation structure.`
    }

    prompt += `

                    Raw transcription:
                    ${rawTranscription}`

    const model = genAI.getGenerativeModel({ model: MODEL_NAME })

    const result = await model.generateContent(prompt)
    const response = await result.response
    const polishedText = response.text()

    if (!polishedText) {
      throw new Error("Polishing failed or returned empty")
    }

    return {
      success: true,
      polishedNote: polishedText,
    }
  } catch (error) {
    console.error("Error in polishNote:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

export async function detectMedicalTopics(text: string) {
  try {
    if (!text || text.trim() === "") {
      return {
        success: true,
        topics: [],
        isMedical: false,
      }
    }

    const genAI = initializeGenAI()

    const prompt = `Analyze the following text and determine if it contains medical content. 
    If it does, extract key medical topics, conditions, procedures, medications, or symptoms mentioned.
    
    Return your analysis in this JSON format:
    {
      "isMedical": true/false,
      "confidence": 0-100,
      "topics": ["topic1", "topic2", ...],
      "categories": ["symptoms", "conditions", "procedures", "medications", ...]
    }
    
    Text to analyze:
    ${text}`

    const model = genAI.getGenerativeModel({ model: MODEL_NAME })

    const result = await model.generateContent(prompt)
    const response = await result.response
    const analysisText = response.text()

    try {
      // Try to parse JSON response
      const analysis = JSON.parse(analysisText)
      return {
        success: true,
        ...analysis,
      }
    } catch {
      // Fallback if JSON parsing fails
      const isMedical =
        analysisText.toLowerCase().includes("medical") ||
        analysisText.toLowerCase().includes("health") ||
        analysisText.toLowerCase().includes("symptom")

      return {
        success: true,
        isMedical,
        confidence: isMedical ? 70 : 30,
        topics: [],
        categories: [],
      }
    }
  } catch (error) {
    console.error("Error in detectMedicalTopics:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

export async function saveRecording(
  audioBlob: Blob,
  noteTitle: string,
  rawTranscription: string,
  polishedNote: string,
  medicalTopics: string[] = [],
  isMedical = false,
) {
  try {
    const timestamp = Date.now()
    const audioFileName = `recordings/${timestamp}-${noteTitle.replace(/[^a-zA-Z0-9]/g, "_")}.webm`
    const metadataFileName = `metadata/${timestamp}-${noteTitle.replace(/[^a-zA-Z0-9]/g, "_")}.json`

    // Convert blob to buffer for upload
    const audioBuffer = await audioBlob.arrayBuffer()

    // Upload audio file to Vercel Blob
    const audioBlob_result = await put(audioFileName, audioBuffer, {
      access: "public",
      contentType: audioBlob.type || "audio/webm",
    })

    // Create metadata object
    const metadata = {
      id: timestamp.toString(),
      title: noteTitle,
      rawTranscription,
      polishedNote,
      medicalTopics,
      isMedical,
      timestamp,
      audioUrl: audioBlob_result.url,
      createdAt: new Date().toISOString(),
    }

    // Upload metadata to Vercel Blob
    const metadataBlob = await put(metadataFileName, JSON.stringify(metadata, null, 2), {
      access: "public",
      contentType: "application/json",
    })

    return {
      success: true,
      message: "Recording saved successfully.",
      recordingId: timestamp.toString(),
      audioUrl: audioBlob_result.url,
      metadataUrl: metadataBlob.url,
    }
  } catch (error) {
    console.error("Error saving recording:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

export async function getSavedRecordings() {
  try {
    // List all metadata files
    const { blobs } = await list({
      prefix: "metadata/",
      limit: 100,
    })

    const recordings = []

    // Fetch metadata for each recording
    for (const blob of blobs) {
      try {
        const response = await fetch(blob.url)
        const metadata = await response.json()
        recordings.push(metadata)
      } catch (error) {
        console.error("Error fetching metadata:", error)
      }
    }

    // Sort by timestamp (newest first)
    recordings.sort((a, b) => b.timestamp - a.timestamp)

    return {
      success: true,
      recordings,
    }
  } catch (error) {
    console.error("Error getting saved recordings:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      recordings: [],
    }
  }
}

export async function deleteRecording(recordingId: string) {
  try {
    // List all blobs to find the ones matching this recording ID
    const { blobs } = await list()

    const blobsToDelete = blobs.filter((blob) => blob.pathname.includes(recordingId))

    // Delete all matching blobs
    for (const blob of blobsToDelete) {
      await del(blob.url)
    }

    return {
      success: true,
      message: "Recording deleted successfully.",
    }
  } catch (error) {
    console.error("Error deleting recording:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}
