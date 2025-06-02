"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { GoogleGenAI } from "@google/genai"
import { marked } from "marked"

const MODEL_NAME = "gemini-2.5-flash-preview-04-17"

interface Note {
  id: string
  rawTranscription: string
  polishedNote: string
  timestamp: number
}

export default function DictateApp() {
  // State management
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStatus, setRecordingStatus] = useState("Ready to record")
  const [rawTranscription, setRawTranscription] = useState("")
  const [polishedNote, setPolishedNote] = useState("")
  const [noteTitle, setNoteTitle] = useState("Untitled Note")
  const [activeTab, setActiveTab] = useState("note")
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [isLiveRecording, setIsLiveRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState("00:00.00")

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const genAIRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserNodeRef = useRef<AnalyserNode | null>(null)
  const waveformDataArrayRef = useRef<Uint8Array | null>(null)
  const animationIdRef = useRef<number | null>(null)
  const timerIntervalRef = useRef<number | null>(null)
  const recordingStartTimeRef = useRef<number>(0)

  // Initialize Gemini AI
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) {
      console.error("NEXT_PUBLIC_GEMINI_API_KEY is not set")
      setRecordingStatus("API key not configured. Please add NEXT_PUBLIC_GEMINI_API_KEY environment variable.")
      return
    }

    genAIRef.current = new GoogleGenAI({
      apiKey: apiKey,
      apiVersion: "v1alpha",
    })
  }, [])

  // Theme management
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme")
    if (savedTheme === "light") {
      setIsDarkMode(false)
      document.body.classList.add("light-mode")
    } else {
      setIsDarkMode(true)
      document.body.classList.remove("light-mode")
    }
  }, [])

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode)
    if (!isDarkMode) {
      localStorage.setItem("theme", "light")
      document.body.classList.add("light-mode")
    } else {
      localStorage.setItem("theme", "dark")
      document.body.classList.remove("light-mode")
    }
  }

  // Audio visualization
  const setupAudioVisualizer = useCallback(() => {
    if (!streamRef.current || audioContextRef.current) return

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    const source = audioContextRef.current.createMediaStreamSource(streamRef.current)
    analyserNodeRef.current = audioContextRef.current.createAnalyser()

    analyserNodeRef.current.fftSize = 256
    analyserNodeRef.current.smoothingTimeConstant = 0.75

    const bufferLength = analyserNodeRef.current.frequencyBinCount
    waveformDataArrayRef.current = new Uint8Array(bufferLength)

    source.connect(analyserNodeRef.current)
  }, [])

  const drawLiveWaveform = useCallback(() => {
    if (!analyserNodeRef.current || !waveformDataArrayRef.current || !canvasRef.current || !isRecording) {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
        animationIdRef.current = null
      }
      return
    }

    animationIdRef.current = requestAnimationFrame(drawLiveWaveform)
    analyserNodeRef.current.getByteFrequencyData(waveformDataArrayRef.current)

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const logicalWidth = canvas.clientWidth
    const logicalHeight = canvas.clientHeight

    // Set canvas size
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(logicalWidth * dpr)
    canvas.height = Math.round(logicalHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, logicalWidth, logicalHeight)

    const bufferLength = analyserNodeRef.current.frequencyBinCount
    const numBars = Math.floor(bufferLength * 0.5)

    if (numBars === 0) return

    const totalBarPlusSpacingWidth = logicalWidth / numBars
    const barWidth = Math.max(1, Math.floor(totalBarPlusSpacingWidth * 0.7))
    const barSpacing = Math.max(0, Math.floor(totalBarPlusSpacingWidth * 0.3))

    let x = 0
    const recordingColor = "#ff3b30"
    ctx.fillStyle = recordingColor

    for (let i = 0; i < numBars; i++) {
      if (x >= logicalWidth) break

      const dataIndex = Math.floor(i * (bufferLength / numBars))
      const barHeightNormalized = waveformDataArrayRef.current[dataIndex] / 255.0
      let barHeight = barHeightNormalized * logicalHeight

      if (barHeight < 1 && barHeight > 0) barHeight = 1
      barHeight = Math.round(barHeight)

      const y = Math.round((logicalHeight - barHeight) / 2)

      ctx.fillRect(Math.floor(x), y, barWidth, barHeight)
      x += barWidth + barSpacing
    }
  }, [isRecording])

  // Timer update
  const updateTimer = useCallback(() => {
    if (!isRecording) return
    const now = Date.now()
    const elapsedMs = now - recordingStartTimeRef.current

    const totalSeconds = Math.floor(elapsedMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const hundredths = Math.floor((elapsedMs % 1000) / 10)

    setRecordingTime(
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`,
    )
  }, [isRecording])

  // Start recording
  const startRecording = async () => {
    try {
      audioChunksRef.current = []

      // Clean up existing streams
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        await audioContextRef.current.close()
        audioContextRef.current = null
      }

      setRecordingStatus("Requesting microphone access...")

      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        console.error("Failed with basic constraints:", err)
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
      }

      try {
        mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
          mimeType: "audio/webm",
        })
      } catch (e) {
        console.error("audio/webm not supported, trying default:", e)
        mediaRecorderRef.current = new MediaRecorder(streamRef.current)
      }

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        setIsLiveRecording(false)

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mediaRecorderRef.current?.mimeType || "audio/webm",
          })
          processAudio(audioBlob)
        } else {
          setRecordingStatus("No audio data captured. Please try again.")
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setIsLiveRecording(true)

      // Start timer
      recordingStartTimeRef.current = Date.now()
      timerIntervalRef.current = window.setInterval(updateTimer, 50)

      // Setup visualizer
      setupAudioVisualizer()
      drawLiveWaveform()
    } catch (error) {
      console.error("Error starting recording:", error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorName = error instanceof Error ? error.name : "Unknown"

      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        setRecordingStatus("Microphone permission denied. Please check browser settings and reload page.")
      } else if (errorName === "NotFoundError") {
        setRecordingStatus("No microphone found. Please connect a microphone.")
      } else {
        setRecordingStatus(`Error: ${errorMessage}`)
      }

      setIsRecording(false)
      setIsLiveRecording(false)
    }
  }

  // Stop recording
  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop()
      } catch (e) {
        console.error("Error stopping MediaRecorder:", e)
      }

      setIsRecording(false)
      setRecordingStatus("Processing audio...")

      // Clear timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }

      // Clear animation
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
        animationIdRef.current = null
      }

      // Close audio context
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== "closed") {
          await audioContextRef.current.close()
        }
        audioContextRef.current = null
      }
    }
  }

  // Toggle recording
  const toggleRecording = async () => {
    if (!isRecording) {
      await startRecording()
    } else {
      await stopRecording()
    }
  }

  // Process audio
  const processAudio = async (audioBlob: Blob) => {
    if (audioBlob.size === 0) {
      setRecordingStatus("No audio data captured. Please try again.")
      return
    }

    try {
      setRecordingStatus("Converting audio...")

      const reader = new FileReader()
      const readResult = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          try {
            const base64data = reader.result as string
            const base64Audio = base64data.split(",")[1]
            resolve(base64Audio)
          } catch (err) {
            reject(err)
          }
        }
        reader.onerror = () => reject(reader.error)
      })
      reader.readAsDataURL(audioBlob)
      const base64Audio = await readResult

      if (!base64Audio) throw new Error("Failed to convert audio to base64")

      const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm"
      await getTranscription(base64Audio, mimeType)
    } catch (error) {
      console.error("Error in processAudio:", error)
      setRecordingStatus("Error processing recording. Please try again.")
    }
  }

  // Get transcription
  const getTranscription = async (base64Audio: string, mimeType: string) => {
    try {
      if (!genAIRef.current) {
        throw new Error("Gemini AI not initialized. Please check your API key configuration.")
      }

      setRecordingStatus("Getting transcription...")

      const contents = [
        { text: "Generate a complete, detailed transcript of this audio." },
        { inlineData: { mimeType: mimeType, data: base64Audio } },
      ]

      const response = await genAIRef.current.models.generateContent({
        model: MODEL_NAME,
        contents: contents,
      })

      const transcriptionText = response.text

      if (transcriptionText) {
        setRawTranscription(transcriptionText)
        setRecordingStatus("Transcription complete. Polishing note...")
        await getPolishedNote(transcriptionText)
      } else {
        setRecordingStatus("Transcription failed or returned empty.")
        setPolishedNote("Could not transcribe audio. Please try again.")
        setRawTranscription("")
      }
    } catch (error) {
      console.error("Error getting transcription:", error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes("API key")) {
        setRecordingStatus("API key error. Please check your NEXT_PUBLIC_GEMINI_API_KEY environment variable.")
      } else {
        setRecordingStatus("Error getting transcription. Please try again.")
      }

      setPolishedNote(`Error during transcription: ${errorMessage}`)
      setRawTranscription("")
    }
  }

  // Get polished note
  const getPolishedNote = async (transcription: string) => {
    try {
      if (!transcription || transcription.trim() === "") {
        setRecordingStatus("No transcription to polish")
        setPolishedNote("No transcription available to polish.")
        return
      }

      if (!genAIRef.current) {
        throw new Error("Gemini AI not initialized. Please check your API key configuration.")
      }

      setRecordingStatus("Polishing note...")

      const prompt = `Take this raw transcription and create a polished, well-formatted note.
                    Remove filler words (um, uh, like), repetitions, and false starts.
                    Format any lists or bullet points properly. Use markdown formatting for headings, lists, etc.
                    Maintain all the original content and meaning.

                    Raw transcription:
                    ${transcription}`

      const contents = [{ text: prompt }]

      const response = await genAIRef.current.models.generateContent({
        model: MODEL_NAME,
        contents: contents,
      })

      const polishedText = response.text

      if (polishedText) {
        setPolishedNote(polishedText)

        // Extract title from polished note
        const lines = polishedText.split("\n").map((l) => l.trim())
        let titleSet = false

        for (const line of lines) {
          if (line.startsWith("#")) {
            const title = line.replace(/^#+\s+/, "").trim()
            if (title) {
              setNoteTitle(title)
              titleSet = true
              break
            }
          }
        }

        if (!titleSet) {
          for (const line of lines) {
            if (line.length > 0) {
              let potentialTitle = line.replace(/^[*_`#\->\s[\](.\d)]+/, "")
              potentialTitle = potentialTitle.replace(/[*_`#]+$/, "")
              potentialTitle = potentialTitle.trim()

              if (potentialTitle.length > 3) {
                const maxLength = 60
                setNoteTitle(potentialTitle.substring(0, maxLength) + (potentialTitle.length > maxLength ? "..." : ""))
                titleSet = true
                break
              }
            }
          }
        }

        setRecordingStatus("Note polished. Ready for next recording.")
      } else {
        setRecordingStatus("Polishing failed or returned empty.")
        setPolishedNote("Polishing returned empty. Raw transcription is available.")
      }
    } catch (error) {
      console.error("Error polishing note:", error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes("API key")) {
        setRecordingStatus("API key error. Please check your NEXT_PUBLIC_GEMINI_API_KEY environment variable.")
      } else {
        setRecordingStatus("Error polishing note. Please try again.")
      }

      setPolishedNote(`Error during polishing: ${errorMessage}`)
    }
  }

  // Create new note
  const createNewNote = () => {
    setRawTranscription("")
    setPolishedNote("")
    setNoteTitle("Untitled Note")
    setRecordingStatus("Ready to record")
    setActiveTab("note")

    if (isRecording) {
      stopRecording()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close()
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
    }
  }, [])

  return (
    <div className="app-container">
      <div className="main-content">
        <div className="note-area">
          <div className="note-header">
            <div
              className="editor-title"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => setNoteTitle(e.currentTarget.textContent || "Untitled Note")}
            >
              {noteTitle}
            </div>
            <div className="tab-navigation-container">
              <div className="tab-navigation">
                <button
                  className={`tab-button ${activeTab === "note" ? "active" : ""}`}
                  onClick={() => setActiveTab("note")}
                >
                  Polished
                </button>
                <button
                  className={`tab-button ${activeTab === "raw" ? "active" : ""}`}
                  onClick={() => setActiveTab("raw")}
                >
                  Raw
                </button>
                <div className="active-tab-indicator"></div>
              </div>
            </div>
          </div>

          <div className="note-content-wrapper">
            <div
              className={`note-content ${activeTab === "note" ? "active" : ""}`}
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{
                __html: polishedNote ? marked.parse(polishedNote) : "<em>Your polished notes will appear here...</em>",
              }}
              onBlur={(e) => setPolishedNote(e.currentTarget.textContent || "")}
            />
            <div
              className={`note-content ${activeTab === "raw" ? "active" : ""}`}
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => setRawTranscription(e.currentTarget.textContent || "")}
            >
              {rawTranscription || "Raw transcription will appear here..."}
            </div>
          </div>
        </div>

        <div className={`recording-interface ${isLiveRecording ? "is-live" : ""}`}>
          {isLiveRecording && (
            <>
              <div className="live-recording-title">{noteTitle !== "Untitled Note" ? noteTitle : "New Recording"}</div>
              <canvas ref={canvasRef} id="liveWaveformCanvas" />
              <div className="live-recording-timer">{recordingTime}</div>
            </>
          )}

          {!isLiveRecording && (
            <div className="status-indicator">
              <span className="status-text">{recordingStatus}</span>
            </div>
          )}

          <div className="recording-controls">
            {!isLiveRecording && (
              <button className="action-button" onClick={toggleTheme} title="Toggle Theme">
                <i className={`fas ${isDarkMode ? "fa-sun" : "fa-moon"}`}></i>
              </button>
            )}

            <button
              className={`record-button ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
              title={isRecording ? "Stop Recording" : "Start Recording"}
            >
              <div className="record-button-inner">
                <i className={`fas ${isRecording ? "fa-stop" : "fa-microphone"}`}></i>
              </div>
              {isRecording && !isLiveRecording && (
                <svg className="record-waves" viewBox="0 0 200 200">
                  <circle className="wave wave1" cx="100" cy="100" r="40" />
                  <circle className="wave wave2" cx="100" cy="100" r="70" />
                  <circle className="wave wave3" cx="100" cy="100" r="100" />
                </svg>
              )}
              {!isLiveRecording && <span className="record-text">Record</span>}
            </button>

            {!isLiveRecording && (
              <button className="action-button" onClick={createNewNote} title="New Note / Clear">
                <i className="fas fa-file"></i>
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @import url(https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css);
        @import url(https://fonts.cdnfonts.com/css/sf-mono);

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        :root {
          --color-bg-dark: #121212;
          --color-bg-alt-dark: #1E1E1E;
          --color-surface-dark: rgba(255, 255, 255, 0.05);
          --color-surface-hover-dark: rgba(255, 255, 255, 0.08);
          --color-surface-active-dark: rgba(255, 255, 255, 0.12);
          --color-text-dark: #E1E1E1;
          --color-text-secondary-dark: #A8A8A8;
          --color-text-tertiary-dark: #7F7F7F;
          --color-accent-dark: #82aaff;
          --color-accent-alt-dark: #c792ea;
          --color-cursor-dark: var(--color-accent-dark);
          --color-border-dark: rgba(255, 255, 255, 0.12);
          --color-recording-dark: #ff453a;
          --color-success-dark: #32d74b;

          --glass-bg-dark: rgba(30, 30, 30, 0.6);
          --glass-border-dark: rgba(255, 255, 255, 0.15);
          --glass-highlight-dark: rgba(255, 255, 255, 0.1);
          --glass-shadow-dark: rgba(0, 0, 0, 0.3);

          --glass-recording-bg-dark: rgba(28, 28, 30, 0.75);
          --glass-recording-border-dark: rgba(255, 255, 255, 0.15);

          --color-bg-light: #F7F7F7;
          --color-bg-alt-light: #EDEDED;
          --color-surface-light: #FFFFFF;
          --color-surface-hover-light: #F0F0F0;
          --color-surface-active-light: #EAEAEA;
          --color-text-light: #333333;
          --color-text-secondary-light: #666666;
          --color-text-tertiary-light: #999999;
          --color-accent-light: #007AFF;
          --color-accent-alt-light: #5856d6;
          --color-cursor-light: var(--color-accent-light);
          --color-border-light: #DCDCDC;
          --color-recording-light: #ff3b30;
          --color-success-light: #30d158;

          --glass-bg-light: rgba(255, 255, 255, 0.65);
          --glass-border-light: rgba(0, 0, 0, 0.07);
          --glass-highlight-light: var(--color-surface-active-light);
          --glass-shadow-light: rgba(0, 0, 0, 0.05);

          --glass-recording-bg-light: rgba(248, 248, 248, 0.75);
          --glass-recording-border-light: rgba(0, 0, 0, 0.1);

          --color-bg: var(--color-bg-dark);
          --color-bg-alt: var(--color-bg-alt-dark);
          --color-surface: var(--color-surface-dark);
          --color-surface-hover: var(--color-surface-hover-dark);
          --color-surface-active: var(--color-surface-active-dark);
          --color-text: var(--color-text-dark);
          --color-text-secondary: var(--color-text-secondary-dark);
          --color-text-tertiary: var(--color-text-tertiary-dark);
          --color-accent: var(--color-accent-dark);
          --color-accent-alt: var(--color-accent-alt-dark);
          --color-cursor: var(--color-cursor-dark);
          --color-border: var(--color-border-dark);
          --color-recording: var(--color-recording-dark);
          --color-success: var(--color-success-dark);
          --glass-bg: var(--glass-bg-dark);
          --glass-border: var(--glass-border-dark);
          --glass-highlight: var(--glass-highlight-dark);
          --glass-shadow: var(--glass-shadow-dark);
          --glass-recording-bg: var(--glass-recording-bg-dark);
          --glass-recording-border: var(--glass-recording-border-dark);

          --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
          --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.3);
          --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
          --transition-fast: 0.2s ease;
          --transition-normal: 0.3s ease;
          --transition-slow: 0.45s ease;
          --transition-tabs: 0.3s cubic-bezier(0.4, 0, 0.2, 1);

          --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
          --font-mono: 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;

          --footer-height: 120px;
          --live-footer-height: 350px;
        }

        body.light-mode {
          --color-bg: var(--color-bg-light);
          --color-bg-alt: var(--color-bg-alt-light);
          --color-surface: var(--color-surface-light);
          --color-surface-hover: var(--color-surface-hover-light);
          --color-surface-active: var(--color-surface-active-light);
          --color-text: var(--color-text-light);
          --color-text-secondary: var(--color-text-secondary-light);
          --color-text-tertiary: var(--color-text-tertiary-light);
          --color-accent: var(--color-accent-light);
          --color-accent-alt: var(--color-accent-alt-light);
          --color-cursor: var(--color-cursor-light);
          --color-border: var(--color-border-light);
          --color-recording: var(--color-recording-light);
          --color-success: var(--color-success-light);
          --glass-bg: var(--glass-bg-light);
          --glass-border: var(--glass-border-light);
          --glass-highlight: var(--glass-highlight-light);
          --glass-shadow: var(--glass-shadow-light);
          --glass-recording-bg: var(--glass-recording-bg-light);
          --glass-recording-border: var(--glass-recording-border-light);

          --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 1px rgba(0,0,0,0.03);
          --shadow-md: 0 2px 4px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0,0,0,0.04);
          --shadow-lg: 0 4px 8px rgba(0, 0, 0, 0.06), 0 2px 6px rgba(0,0,0,0.05);
        }

        [contenteditable] {
          caret-color: var(--color-cursor);
        }

        html {
          height: 100%;
          overflow: hidden;
        }

        body {
          font-family: var(--font-primary);
          background-color: var(--color-bg);
          color: var(--color-text);
          line-height: 1.65;
          height: 100vh;
          overflow: hidden;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          letter-spacing: -0.01em;
          transition: background-color var(--transition-normal), color var(--transition-normal);
          margin: 0;
        }

        .app-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
        }

        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          transition: padding-bottom var(--transition-slow) ease-in-out;
        }

        .main-content:has(> .recording-interface.is-live) {
          padding-bottom: var(--live-footer-height);
        }

        .note-area {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background-color: var(--color-bg);
          padding: 32px 0 0;
          transition: background-color var(--transition-normal);
          min-height: 0;
        }

        .note-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 40px 16px;
          border-bottom: 1px solid var(--color-border);
          margin-bottom: 12px;
          transition: border-color var(--transition-normal);
        }

        .editor-title {
          font-size: 22px;
          font-weight: 600;
          outline: none;
          border: none;
          padding: 0;
          margin: 0;
          flex-grow: 1;
          margin-right: 24px;
          color: var(--color-text);
          font-family: var(--font-primary);
          background-color: transparent;
        }

        .tab-navigation-container {
          background: var(--glass-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 4px;
          display: inline-flex;
          box-shadow: var(--shadow-sm);
          transition: background-color var(--transition-normal), border-color var(--transition-normal);
        }

        .tab-navigation {
          display: flex;
          position: relative;
          border-radius: 7px;
          overflow: hidden;
        }

        .tab-button {
          background: transparent;
          border: none;
          padding: 6px 16px;
          margin: 0;
          font-size: 13px;
          font-weight: 500;
          color: var(--color-text-secondary);
          border-radius: 6px;
          cursor: pointer;
          transition: color var(--transition-fast);
          position: relative;
          z-index: 1;
          flex-shrink: 0;
          font-family: var(--font-primary);
          letter-spacing: -0.01em;
        }

        .tab-button:hover {
          color: var(--color-text);
        }

        .tab-button.active {
          color: var(--color-text);
        }

        .active-tab-indicator {
          position: absolute;
          top: 0;
          left: 0;
          width: 0;
          height: 100%;
          background-color: var(--glass-highlight);
          border-radius: 6px;
          transition: left var(--transition-tabs), width var(--transition-tabs);
          z-index: 0;
          box-shadow: 0 0.5px 1.5px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.02) inset;
        }

        .note-content-wrapper {
          flex: 1;
          overflow-y: auto;
          padding: 0 40px 40px;
          position: relative;
          min-height: 0;
        }

        .note-content {
          outline: none;
          min-height: 100px;
          font-size: 16px;
          line-height: 1.7;
          color: var(--color-text);
          padding: 12px 0;
          font-family: var(--font-primary);
          letter-spacing: -0.01em;
          opacity: 0;
          transform: scale(0.985) translateY(8px);
          transition: opacity var(--transition-tabs), transform var(--transition-tabs);
          display: none;
          will-change: opacity, transform;
        }

        .note-content.active {
          opacity: 1;
          transform: scale(1) translateY(0);
          display: block;
        }

        .note-content h1, .note-content h2, .note-content h3 { 
          margin-bottom: 0.75em; 
          margin-top: 1.25em; 
          font-weight: 600; 
          color: var(--color-text); 
        }
        .note-content h1 { font-size: 1.8em; }
        .note-content h2 { font-size: 1.5em; }
        .note-content h3 { font-size: 1.25em; }
        .note-content p { margin-bottom: 1em; }
        .note-content ul, .note-content ol { margin-bottom: 1em; padding-left: 1.5em; }
        .note-content li { margin-bottom: 0.5em; }
        .note-content pre { 
          background-color: var(--color-bg-alt); 
          padding: 1em; 
          border-radius: 8px; 
          margin-bottom: 1em; 
          font-size: 0.9em; 
          overflow-x: auto; 
          transition: background-color var(--transition-normal); 
          font-family: var(--font-mono); 
        }
        .note-content code { 
          font-family: var(--font-mono); 
          background-color: var(--color-bg-alt); 
          padding: 0.2em 0.4em; 
          border-radius: 4px; 
          font-size: 0.9em;
        }
        .note-content pre code { 
          background-color: transparent; 
          padding: 0; 
          border-radius: 0;
        }

        .recording-interface {
          height: var(--footer-height);
          width: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 12px 20px;
          background-color: transparent;
          border-top: 1px solid transparent;
          flex-shrink: 0;
          transition: opacity 0.3s ease-out, transform 0.35s ease-out,
                      background-color var(--transition-slow) ease-in-out,
                      height var(--transition-slow) ease-in-out;
          z-index: 10;
        }

        .recording-interface.is-live {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: var(--live-footer-height);
          z-index: 1000;
          background-color: var(--glass-recording-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid var(--glass-recording-border);
          box-shadow: 0 -4px 20px var(--glass-shadow);
          justify-content: flex-start;
          padding-top: 20px;
          padding-bottom: 20px;
        }

        .status-indicator { 
          margin-bottom: 16px; 
        }

        .recording-interface.is-live .status-indicator { 
          display: none; 
        }

        .status-text { 
          font-size: 14px; 
          color: var(--color-text-tertiary); 
          text-align: center; 
          transition: color var(--transition-normal); 
          font-family: var(--font-primary); 
        }

        .live-recording-title,
        #liveWaveformCanvas,
        .live-recording-timer {
          opacity: 0;
          transform: translateY(15px);
          transition: opacity 0.3s ease-out 0.1s, transform 0.35s ease-out 0.1s;
        }

        .recording-interface.is-live .live-recording-title,
        .recording-interface.is-live #liveWaveformCanvas,
        .recording-interface.is-live .live-recording-timer {
          opacity: 1;
          transform: translateY(0);
        }

        .live-recording-title {
          font-size: 17px;
          color: var(--color-text);
          margin-bottom: 12px;
          text-align: center;
          font-weight: 500;
          font-family: var(--font-primary);
        }

        #liveWaveformCanvas {
          width: 100%;
          max-width: 340px;
          height: 70px;
          margin-bottom: 18px;
          border-radius: 4px;
        }

        .live-recording-timer {
          font-family: var(--font-mono);
          font-size: 44px;
          font-weight: 400;
          color: var(--color-text);
          margin-bottom: 22px;
          text-align: center;
          letter-spacing: 0.01em;
        }

        .recording-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          position: relative;
        }

        .action-button {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          width: 48px; 
          height: 48px; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center;
          color: var(--color-text-secondary); 
          font-size: 18px;
          cursor: pointer;
          transition: var(--transition-fast) background-color, var(--transition-fast) color, var(--transition-fast) border-color, var(--transition-fast) transform, var(--transition-fast) box-shadow;
          box-shadow: var(--shadow-sm);
          backdrop-filter: blur(10px); 
          -webkit-backdrop-filter: blur(10px);
        }

        .recording-interface.is-live .action-button { 
          display: none; 
        }

        .action-button:hover { 
          color: var(--color-text); 
          transform: translateY(-2px) scale(1.05); 
          box-shadow: var(--shadow-md); 
          background-color: var(--color-surface-hover); 
          border-color: var(--glass-highlight); 
        }

        .record-button { 
          position: relative; 
          width: 72px; 
          height: 72px; 
          border-radius: 50%; 
          border: none; 
          outline: none; 
          background: none; 
          cursor: pointer; 
          z-index: 1; 
        }

        .record-button-inner {
          position: relative; 
          width: 100%; 
          height: 100%; 
          border-radius: 50%;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          display: flex; 
          align-items: center; 
          justify-content: center;
          color: var(--color-text); 
          font-size: 24px; 
          z-index: 2; 
          box-shadow: var(--shadow-md);
          transition: all var(--transition-normal);
          backdrop-filter: blur(15px); 
          -webkit-backdrop-filter: blur(15px);
        }

        .record-button:hover .record-button-inner { 
          transform: scale(1.08); 
          background-color: var(--color-surface-hover); 
          border-color: var(--glass-highlight); 
        }

        .record-button.recording .record-button-inner { 
          background-color: var(--color-recording); 
          border: 1px solid transparent; 
          color: white; 
        }

        .record-button.recording:hover .record-button-inner {
          background-color: var(--color-recording);
          filter: brightness(0.9);
        }

        .record-waves { 
          position: absolute; 
          top: 50%; 
          left: 50%; 
          transform: translate(-50%, -50%); 
          width: 200px; 
          height: 200px; 
          z-index: 1; 
          opacity: 0; 
          transition: opacity var(--transition-normal); 
          pointer-events: none; 
        }

        .record-button.recording .record-waves { 
          opacity: 1; 
        }

        .recording-interface.is-live .record-waves { 
          display: none; 
        }

        .wave { 
          fill: none; 
          stroke: var(--color-recording); 
          stroke-width: 1.5px; 
          opacity: 0; 
          transform-origin: center; 
        }

        .record-button.recording .wave1 { 
          animation: wave 2s infinite ease-out; 
        }
        .record-button.recording .wave2 { 
          animation: wave 2s infinite ease-out; 
          animation-delay: 0.4s; 
        }
        .record-button.recording .wave3 { 
          animation: wave 2s infinite ease-out; 
          animation-delay: 0.8s; 
        }

        @keyframes wave { 
          0% { 
            transform: scale(0.4); 
            opacity: 0.8; 
            stroke-width: 2px; 
          } 
          100% { 
            transform: scale(1.8); 
            opacity: 0; 
            stroke-width: 0.5px; 
          } 
        }

        .record-text { 
          position: absolute; 
          bottom: -30px; 
          left: 50%; 
          transform: translateX(-50%); 
          font-size: 12px; 
          white-space: nowrap; 
          color: var(--color-text-tertiary); 
          opacity: 0; 
          transition: opacity var(--transition-fast); 
          font-family: var(--font-primary); 
        }

        .record-button:hover .record-text { 
          opacity: 1; 
        }

        .recording-interface.is-live .record-text { 
          display: none; 
        }

        ::-webkit-scrollbar { 
          width: 10px; 
          height: 10px; 
        }
        ::-webkit-scrollbar-track { 
          background: var(--color-bg-alt); 
          border-radius: 5px; 
        }
        ::-webkit-scrollbar-thumb { 
          background: var(--glass-border); 
          border-radius: 5px; 
          border: 2px solid transparent; 
          background-clip: content-box; 
        }
        ::-webkit-scrollbar-thumb:hover { 
          background: var(--glass-highlight); 
        }

        @media (max-width: 768px) {
          .note-area { 
            padding: 20px 0 0; 
          }
          .note-header { 
            padding: 0 20px 12px; 
            flex-direction: column; 
            align-items: stretch; 
            gap: 12px; 
          }
          .editor-title { 
            padding: 0; 
            font-size: 20px; 
            margin-bottom: 0; 
            margin-right: 0; 
            text-align: left; 
          }
          .tab-navigation-container { 
            width: 100%; 
          }
          .tab-navigation { 
            width: 100%; 
          }
          .tab-button { 
            flex-grow: 1; 
            text-align: center; 
          }
          .note-content-wrapper { 
            padding: 0 20px 20px; 
          }
          .recording-interface.is-live { 
            padding-left: 15px; 
            padding-right: 15px; 
          }
          #liveWaveformCanvas { 
            max-width: calc(100% - 30px); 
            height: 60px; 
          }
          .live-recording-timer { 
            font-size: 36px; 
          }
          .action-button { 
            width: 44px; 
            height: 44px; 
            font-size: 16px; 
          }
          .record-button { 
            width: 64px; 
            height: 64px; 
          }
        }
      `}</style>
    </div>
  )
}
