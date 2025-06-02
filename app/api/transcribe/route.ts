import { type NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get("audio") as File
    const service = formData.get("service") as string
    const enableMedical = formData.get("enableMedical") === "true"
    const enableMultiSpeaker = formData.get("enableMultiSpeaker") === "true"

    console.log("Received transcription request:", {
      fileName: audioFile?.name,
      fileSize: audioFile?.size,
      fileType: audioFile?.type,
      service,
      enableMedical,
      enableMultiSpeaker,
    })

    if (!audioFile) {
      return NextResponse.json({ success: false, error: "No audio file provided" }, { status: 400 })
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (audioFile.size > maxSize) {
      return NextResponse.json({ success: false, error: "File too large. Maximum size is 50MB." }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = [
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/m4a",
      "audio/aac",
      "video/webm",
      "video/mp4",
    ]

    if (!allowedTypes.includes(audioFile.type) && !audioFile.name.match(/\.(mp3|wav|m4a|aac|ogg|webm|mp4)$/i)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported file type. Please use MP3, WAV, M4A, AAC, OGG, WebM, or MP4 files.",
        },
        { status: 400 },
      )
    }

    let rawTranscription = ""
    let polishedNote = ""
    let multiSpeakerOutput = ""
    let medicalTopics: string[] = []

    if (service === "gemini") {
      // Convert file to base64 for Gemini
      const bytes = await audioFile.arrayBuffer()
      const base64Audio = Buffer.from(bytes).toString("base64")
      const mimeType = audioFile.type || "audio/webm"

      // Transcribe with Gemini
      const transcriptionResult = await transcribeWithGemini(base64Audio, mimeType, enableMultiSpeaker)
      if (!transcriptionResult.success) {
        return NextResponse.json({ success: false, error: transcriptionResult.error })
      }
      rawTranscription = transcriptionResult.transcription

      // Polish the note
      const polishResult = await polishNoteWithGemini(rawTranscription, enableMedical)
      if (polishResult.success) {
        polishedNote = polishResult.polishedNote
      }

      // Multi-speaker output (same as raw for Gemini unless specifically processed)
      multiSpeakerOutput = rawTranscription

      // Detect medical topics if enabled
      if (enableMedical) {
        const topicsResult = await detectMedicalTopics(rawTranscription)
        if (topicsResult.success) {
          medicalTopics = topicsResult.topics
        }
      }
    } else if (service === "openai_whisper") {
      // Transcribe with OpenAI Whisper
      const transcriptionResult = await transcribeWithOpenAI(audioFile, enableMultiSpeaker)
      if (!transcriptionResult.success) {
        return NextResponse.json({ success: false, error: transcriptionResult.error })
      }
      rawTranscription = transcriptionResult.transcription
      multiSpeakerOutput = transcriptionResult.transcription

      // Polish with Gemini
      const polishResult = await polishNoteWithGemini(rawTranscription, enableMedical)
      if (polishResult.success) {
        polishedNote = polishResult.polishedNote
      }

      // Detect medical topics if enabled
      if (enableMedical) {
        const topicsResult = await detectMedicalTopics(rawTranscription)
        if (topicsResult.success) {
          medicalTopics = topicsResult.topics
        }
      }
    } else if (service === "deepgram_nova") {
      // Transcribe with Deepgram
      const transcriptionResult = await transcribeWithDeepgram(audioFile, enableMultiSpeaker)
      if (!transcriptionResult.success) {
        return NextResponse.json({ success: false, error: transcriptionResult.error })
      }
      rawTranscription = transcriptionResult.transcription
      multiSpeakerOutput = transcriptionResult.multiSpeakerOutput || transcriptionResult.transcription

      // Polish with Gemini
      const polishResult = await polishNoteWithGemini(rawTranscription, enableMedical)
      if (polishResult.success) {
        polishedNote = polishResult.polishedNote
      }

      // Use Deepgram topics if available, otherwise detect with Gemini
      if (transcriptionResult.topics && transcriptionResult.topics.length > 0) {
        medicalTopics = transcriptionResult.topics
      } else if (enableMedical) {
        const topicsResult = await detectMedicalTopics(rawTranscription)
        if (topicsResult.success) {
          medicalTopics = topicsResult.topics
        }
      }
    } else {
      return NextResponse.json({ success: false, error: "Invalid service specified" }, { status: 400 })
    }

    console.log("Transcription completed successfully:", {
      service,
      rawLength: rawTranscription.length,
      polishedLength: polishedNote.length,
      topicsCount: medicalTopics.length,
    })

    return NextResponse.json({
      success: true,
      rawTranscription,
      polishedNote,
      multiSpeakerOutput,
      medicalTopics,
      service,
    })
  } catch (error) {
    console.error("Transcription error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}

async function transcribeWithGemini(base64Audio: string, mimeType: string, enableMultiSpeaker: boolean) {
  try {
    let prompt =
      "Generate a complete, detailed transcript of this audio. Focus on accuracy and include all spoken content."

    if (enableMultiSpeaker) {
      prompt = `Generate a complete, detailed transcript of this audio with speaker identification. 
      Format the output as:
      
      Speaker 1: [their dialogue]
      Speaker 2: [their dialogue]
      
      If you can identify different speakers, label them as Speaker 1, Speaker 2, etc. 
      If there's only one speaker, just use Speaker 1.
      Include timestamps if possible in the format [MM:SS].`
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

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
    console.error("Error in transcribeWithGemini:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

async function transcribeWithOpenAI(audioFile: File, enableMultiSpeaker: boolean) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured")
    }

    const formData = new FormData()
    formData.append("file", audioFile, audioFile.name)
    formData.append("model", "whisper-1")
    formData.append("response_format", "text")

    if (enableMultiSpeaker) {
      formData.append("timestamp_granularities[]", "segment")
    }

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const transcriptionText = await response.text()

    return {
      success: true,
      transcription: transcriptionText,
    }
  } catch (error) {
    console.error("Error in transcribeWithOpenAI:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "OpenAI transcription failed",
    }
  }
}

async function transcribeWithDeepgram(audioFile: File, enableMultiSpeaker: boolean) {
  try {
    const params = new URLSearchParams({
      model: "nova-2",
      smart_format: "true",
      punctuate: "true",
      diarize: enableMultiSpeaker ? "true" : "false",
      topics: "true",
    })

    const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": audioFile.type,
      },
      body: audioFile,
    })

    if (!response.ok) {
      throw new Error(`Deepgram API error: ${response.statusText}`)
    }

    const data = await response.json()

    let transcription = ""
    let multiSpeakerOutput = ""
    let topics: string[] = []

    if (data.results?.channels?.[0]?.alternatives?.[0]) {
      const alternative = data.results.channels[0].alternatives[0]
      transcription = alternative.transcript || ""

      // Extract speaker-labeled output if diarization is enabled
      if (enableMultiSpeaker && data.results.utterances) {
        multiSpeakerOutput = data.results.utterances
          .map((utterance: any) => `Speaker ${utterance.speaker}: ${utterance.transcript}`)
          .join("\n")
      }

      // Extract topics
      if (data.results.topics) {
        topics = data.results.topics.map((topic: any) => topic.topic || topic)
      }
    }

    return {
      success: true,
      transcription,
      multiSpeakerOutput,
      topics,
    }
  } catch (error) {
    console.error("Error in transcribeWithDeepgram:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Deepgram transcription failed",
    }
  }
}

async function polishNoteWithGemini(rawTranscription: string, enableMedical: boolean) {
  try {
    if (!rawTranscription || rawTranscription.trim() === "") {
      throw new Error("No transcription provided to polish")
    }

    let prompt = `Take this raw transcription and create a polished, well-formatted note.
                    Remove filler words (um, uh, like), repetitions, and false starts.
                    Format any lists or bullet points properly. Use markdown formatting for headings, lists, etc.
                    Maintain all the original content and meaning.`

    if (enableMedical) {
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

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

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
    console.error("Error in polishNoteWithGemini:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

async function detectMedicalTopics(text: string) {
  try {
    if (!text || text.trim() === "") {
      return {
        success: true,
        topics: [],
        isMedical: false,
      }
    }

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

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

    const result = await model.generateContent(prompt)
    const response = await result.response
    const analysisText = response.text()

    try {
      // Try to parse JSON response
      const analysis = JSON.parse(analysisText)
      return {
        success: true,
        topics: analysis.topics || [],
        isMedical: analysis.isMedical || false,
        confidence: analysis.confidence || 0,
        categories: analysis.categories || [],
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
