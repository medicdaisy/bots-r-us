document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const loadingOverlay = document.getElementById("loadingOverlay")
  const loadingMessage = document.getElementById("loadingMessage")
  const themeToggleCheckbox = document.getElementById("themeToggleCheckbox")
  const statusDisplayText = document.getElementById("statusDisplayText")
  const startRecordBtn = document.getElementById("startRecordBtn")
  const pauseRecordBtn = document.getElementById("pauseRecordBtn")
  const resumeRecordBtn = document.getElementById("resumeRecordBtn")
  const stopRecordBtn = document.getElementById("stopRecordBtn")
  const sttServiceSelect = document.getElementById("sttServiceSelect")

  const transcriptOutputConvo = document.getElementById("transcriptOutputConvo")
  const transcriptOutputPolished = document.getElementById("transcriptOutputPolished")
  const transcriptOutputMultispeaker = document.getElementById("transcriptOutputMultispeaker")
  const detectedTopicsList = document.getElementById("detectedTopicsList")

  const topicMedicalCheckbox = document.getElementById("topicMedical")
  const topicMultiSpeakerCheckbox = document.getElementById("topicMultiSpeaker")
  const topicGeneralCheckbox = document.getElementById("topicGeneral")

  const uploadAudioBtn = document.getElementById("uploadAudioBtn")
  const audioFileUpload = document.getElementById("audioFileUpload")
  const fileNameDisplay = document.getElementById("fileNameDisplay")

  const waveformCanvas = document.getElementById("audioWaveformCanvas")
  const waveformCtx = waveformCanvas.getContext("2d")

  // Audio recording variables
  let audioContext
  let mediaStreamSource
  let analyser
  let dataArray
  let animationFrameId
  let mediaRecorder
  let recordedChunks = []
  let currentStream = null
  let recordingState = "idle"

  // Constants
  const API_BASE = "/api"

  // Initialize
  document.getElementById("currentYear").textContent = new Date().getFullYear()

  // Theme management
  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark-theme")
      themeToggleCheckbox.checked = true
    } else {
      document.body.classList.remove("dark-theme")
      themeToggleCheckbox.checked = false
    }
  }

  const savedTheme = localStorage.getItem("theme")
  if (savedTheme) applyTheme(savedTheme)
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) applyTheme("dark")
  else applyTheme("light")

  themeToggleCheckbox.addEventListener("change", function () {
    const theme = this.checked ? "dark" : "light"
    applyTheme(theme)
    localStorage.setItem("theme", theme)
  })

  // Loading overlay
  function showLoading(message = "Processing...") {
    loadingMessage.textContent = message
    loadingOverlay.classList.add("visible")
  }

  function hideLoading() {
    loadingOverlay.classList.remove("visible")
  }

  // Status updates
  function updateStatus(message, type = "info") {
    statusDisplayText.textContent = message
    statusDisplayText.className = "status-display-text"
    if (type === "error") statusDisplayText.classList.add("error")
    if (type === "success") statusDisplayText.classList.add("success")
    console.log(`Status: ${message} (${type})`)
  }

  // UI state management
  function updateUIForRecordingState() {
    startRecordBtn.disabled = recordingState !== "idle"
    pauseRecordBtn.disabled = recordingState !== "recording"
    resumeRecordBtn.disabled = recordingState !== "paused"
    stopRecordBtn.disabled = recordingState === "idle" || recordingState === "requesting"

    uploadAudioBtn.disabled = recordingState !== "idle"
    sttServiceSelect.disabled = recordingState !== "idle"
    topicMedicalCheckbox.disabled = recordingState !== "idle"
    topicMultiSpeakerCheckbox.disabled = recordingState !== "idle"
    topicGeneralCheckbox.disabled = recordingState !== "idle"

    const buttons = [startRecordBtn, pauseRecordBtn, resumeRecordBtn, stopRecordBtn, uploadAudioBtn]
    buttons.forEach((btn) => {
      btn.classList.toggle("disabled", btn.disabled)
    })
  }

  function clearOutputFields() {
    transcriptOutputConvo.value = ""
    transcriptOutputPolished.value = ""
    transcriptOutputMultispeaker.value = ""
    detectedTopicsList.innerHTML = "<li>No topics detected yet.</li>"
    detectedTopicsList.classList.add("empty")
  }

  function resetToIdle(message = "Idle. Ready to record or upload.", type = "info") {
    recordingState = "idle"
    updateUIForRecordingState()
    updateStatus(message, type)

    fileNameDisplay.textContent = "No file selected."
    if (audioFileUpload.value) audioFileUpload.value = ""
    recordedChunks = []

    stopWaveformVisualization()
    waveformCanvas.style.display = "none"

    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop())
      currentStream = null
    }
    mediaRecorder = null
    hideLoading()

    startRecordBtn.textContent = "Start Recording"
    startRecordBtn.classList.remove("animating")
    pauseRecordBtn.textContent = "Pause"
    resumeRecordBtn.textContent = "Resume"
    stopRecordBtn.textContent = "Stop & Transcribe"
    stopRecordBtn.classList.remove("animating")
    uploadAudioBtn.textContent = "Upload Audio File"
    uploadAudioBtn.classList.remove("animating")
  }

  // Audio visualization
  function setupAudioVisualizer(stream) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)()
    if (audioContext.state === "suspended") audioContext.resume()

    mediaStreamSource = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.75

    const bufferLength = analyser.frequencyBinCount
    dataArray = new Uint8Array(bufferLength)

    mediaStreamSource.connect(analyser)
  }

  function drawWaveform() {
    if (!analyser || !currentStream || !currentStream.active || recordingState === "idle") {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      return
    }

    animationFrameId = requestAnimationFrame(drawWaveform)
    analyser.getByteFrequencyData(dataArray)

    const canvas = waveformCanvas
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

    const bufferLength = analyser.frequencyBinCount
    const numBars = Math.floor(bufferLength * 0.5)

    if (numBars === 0) return

    const totalBarPlusSpacingWidth = logicalWidth / numBars
    const barWidth = Math.max(1, Math.floor(totalBarPlusSpacingWidth * 0.7))
    const barSpacing = Math.max(0, Math.floor(totalBarPlusSpacingWidth * 0.3))

    let x = 0
    const recordingColor = "#60A5FA"
    ctx.fillStyle = recordingColor

    for (let i = 0; i < numBars; i++) {
      if (x >= logicalWidth) break

      const dataIndex = Math.floor(i * (bufferLength / numBars))
      const barHeightNormalized = dataArray[dataIndex] / 255.0
      let barHeight = barHeightNormalized * logicalHeight

      if (barHeight < 1 && barHeight > 0) barHeight = 1
      barHeight = Math.round(barHeight)

      const y = Math.round((logicalHeight - barHeight) / 2)

      ctx.fillRect(Math.floor(x), y, barWidth, barHeight)
      x += barWidth + barSpacing
    }
  }

  function stopWaveformVisualization() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    animationFrameId = null
    if (waveformCtx) waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height)
    if (mediaStreamSource) {
      try {
        mediaStreamSource.disconnect()
      } catch (e) {}
    }
    if (analyser) {
      try {
        analyser.disconnect()
      } catch (e) {}
    }
  }

  // Topic detection
  function displayTopics(topics) {
    detectedTopicsList.innerHTML = ""
    if (topics && topics.length > 0) {
      detectedTopicsList.classList.remove("empty")
      topics.forEach((topic) => {
        const listItem = document.createElement("li")
        listItem.textContent = topic
        detectedTopicsList.appendChild(listItem)
      })
    } else {
      detectedTopicsList.classList.add("empty")
      detectedTopicsList.innerHTML = "<li>No topics detected.</li>"
    }
  }

  // API calls
  async function transcribeAudio(audioBlob, options = {}) {
    const formData = new FormData()
    formData.append("audio", audioBlob)
    formData.append("service", sttServiceSelect.value)
    formData.append("enableMedical", topicMedicalCheckbox.checked)
    formData.append("enableMultiSpeaker", topicMultiSpeakerCheckbox.checked)

    const response = await fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.statusText}`)
    }

    return await response.json()
  }

  async function saveRecording(audioBlob, transcriptionData) {
    const formData = new FormData()
    formData.append("audio", audioBlob)
    formData.append("transcriptionData", JSON.stringify(transcriptionData))

    const response = await fetch(`${API_BASE}/save-recording`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Save failed: ${response.statusText}`)
    }

    return await response.json()
  }

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("audio/")) {
      updateStatus("Please select an audio file", "error")
      return
    }

    updateStatus("Processing uploaded audio...", "info")

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const base64data = e.target?.result
        const base64Audio = base64data.split(",")[1]
        const mimeType = file.type

        await processAudio(file)
      } catch (error) {
        console.error("Error processing uploaded file:", error)
        updateStatus("Error processing uploaded file", "error")
      }
    }
    reader.readAsDataURL(file)
  }

  // Start recording
  const startRecording = async () => {
    try {
      recordedChunks = []

      // Clean up existing streams
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop())
        currentStream = null
      }
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close()
        audioContext = null
      }

      updateStatus("Requesting microphone access...", "info")

      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        console.error("Failed with basic constraints:", err)
        currentStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
      }

      try {
        mediaRecorder = new MediaRecorder(currentStream, {
          mimeType: "audio/webm",
        })
      } catch (e) {
        console.error("audio/webm not supported, trying default:", e)
        mediaRecorder = new MediaRecorder(currentStream)
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        updateStatus("Processing audio...", "info")

        if (recordedChunks.length > 0) {
          const audioBlob = new Blob(recordedChunks, {
            type: mediaRecorder?.mimeType || "audio/webm",
          })
          processAudio(audioBlob)
        } else {
          updateStatus("No audio data captured. Please try again.", "error")
        }

        if (currentStream) {
          currentStream.getTracks().forEach((track) => track.stop())
          currentStream = null
        }
      }

      mediaRecorder.start()
      recordingState = "recording"

      // Setup visualizer
      setupAudioVisualizer(currentStream)
      waveformCanvas.style.display = "block"
      drawWaveform()

      updateUIForRecordingState()
      updateStatus("Recording...", "info")
      startRecordBtn.textContent = "Recording..."
      startRecordBtn.classList.add("animating")
    } catch (error) {
      console.error("Error starting recording:", error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorName = error instanceof Error ? error.name : "Unknown"

      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        updateStatus("Microphone permission denied. Please check browser settings and reload page.", "error")
      } else if (errorName === "NotFoundError") {
        updateStatus("No microphone found. Please connect a microphone.", "error")
      } else {
        updateStatus(`Error: ${errorMessage}`, "error")
      }

      resetToIdle()
    }
  }

  // Stop recording
  const stopRecording = async () => {
    if (mediaRecorder && recordingState === "recording") {
      try {
        mediaRecorder.stop()
      } catch (e) {
        console.error("Error stopping MediaRecorder:", e)
      }

      recordingState = "idle"
      updateStatus("Processing audio...", "info")

      // Close audio context
      if (audioContext) {
        if (audioContext.state !== "closed") {
          await audioContext.close()
        }
        audioContext = null
      }
    }
  }

  // Toggle recording
  const toggleRecording = async () => {
    if (recordingState === "idle") {
      await startRecording()
    } else {
      await stopRecording()
    }
  }

  // Process audio
  const processAudio = async (audioBlob) => {
    if (audioBlob.size === 0) {
      updateStatus("No audio data captured. Please try again.", "error")
      return
    }

    try {
      updateStatus("Getting transcription...", "info")
      showLoading("Transcribing audio...")

      const result = await transcribeAudio(audioBlob)

      if (result.success) {
        transcriptOutputConvo.value = result.rawTranscription || ""
        transcriptOutputPolished.value = result.polishedNote || ""
        transcriptOutputMultispeaker.value = result.multiSpeakerOutput || ""

        if (result.medicalTopics && result.medicalTopics.length > 0) {
          displayTopics(result.medicalTopics)
        } else {
          displayTopics([])
        }

        // Save the recording
        try {
          showLoading("Saving recording...")
          await saveRecording(audioBlob, result)
          updateStatus("Transcription complete and saved!", "success")
        } catch (saveError) {
          console.error("Save error:", saveError)
          updateStatus("Transcription complete but save failed.", "error")
        }
      } else {
        updateStatus(`Transcription failed: ${result.error}`, "error")
      }
    } catch (error) {
      console.error("Processing error:", error)
      updateStatus(`Error: ${error.message}`, "error")
    } finally {
      resetToIdle()
    }
  }

  // Event listeners
  startRecordBtn.addEventListener("click", toggleRecording)

  pauseRecordBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.pause()
      recordingState = "paused"
      updateStatus("Recording paused.", "info")
      updateUIForRecordingState()
      startRecordBtn.textContent = "Paused"
      startRecordBtn.classList.remove("animating")
    }
  })

  resumeRecordBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state === "paused") {
      mediaRecorder.resume()
      recordingState = "recording"
      updateStatus("Recording resumed...", "info")
      updateUIForRecordingState()
      startRecordBtn.textContent = "Recording..."
      startRecordBtn.classList.add("animating")
    }
  })

  stopRecordBtn.addEventListener("click", () => {
    if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
      recordingState = "idle"
      updateUIForRecordingState()
      startRecordBtn.classList.remove("animating")
      stopRecordBtn.textContent = "Finalizing..."
      showLoading("Finalizing recording...")
      mediaRecorder.stop()
    } else {
      resetToIdle("Not actively recording or already stopped.", "info")
    }
  })

  // File upload
  uploadAudioBtn.addEventListener("click", () => {
    if (recordingState !== "idle") {
      updateStatus("Please stop any current recording process first.", "info")
      return
    }
    audioFileUpload.click()
  })

  audioFileUpload.addEventListener("change", async (event) => {
    const file = event.target.files[0]
    if (file) {
      fileNameDisplay.textContent = `Selected: ${file.name}`
      clearOutputFields()
      updateStatus(`Processing "${file.name}"...`, "info")
      showLoading("Processing file...")
      uploadAudioBtn.textContent = "Processing..."
      uploadAudioBtn.classList.add("animating")

      await processAudio(file)
    } else {
      fileNameDisplay.textContent = "No file selected."
      uploadAudioBtn.textContent = "Upload Audio File"
      uploadAudioBtn.classList.remove("animating")
    }
    event.target.value = null
  })

  // Initialize UI
  resetToIdle()

  // Copy to clipboard functionality
  function copyToClipboard(text, buttonElement) {
    if (!text || text.trim() === "") {
      showCopyToast("Nothing to copy", "error")
      return
    }

    if (navigator.clipboard && window.isSecureContext) {
      // Use modern clipboard API
      navigator.clipboard
        .writeText(text)
        .then(() => {
          showCopySuccess(buttonElement)
          showCopyToast("Copied to clipboard!")
        })
        .catch((err) => {
          console.error("Failed to copy:", err)
          fallbackCopyTextToClipboard(text, buttonElement)
        })
    } else {
      // Fallback for older browsers or non-secure contexts
      fallbackCopyTextToClipboard(text, buttonElement)
    }
  }

  function fallbackCopyTextToClipboard(text, buttonElement) {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.left = "-999999px"
    textArea.style.top = "-999999px"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    try {
      const successful = document.execCommand("copy")
      if (successful) {
        showCopySuccess(buttonElement)
        showCopyToast("Copied to clipboard!")
      } else {
        showCopyToast("Copy failed", "error")
      }
    } catch (err) {
      console.error("Fallback copy failed:", err)
      showCopyToast("Copy not supported", "error")
    }

    document.body.removeChild(textArea)
  }

  function showCopySuccess(buttonElement) {
    const originalText = buttonElement.innerHTML
    buttonElement.classList.add("copied")
    buttonElement.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20,6 9,17 4,12"></polyline>
      </svg>
      Copied!
    `

    setTimeout(() => {
      buttonElement.classList.remove("copied")
      buttonElement.innerHTML = originalText
    }, 2000)
  }

  function showCopyToast(message, type = "success") {
    // Remove existing toast if any
    const existingToast = document.querySelector(".copy-toast")
    if (existingToast) {
      existingToast.remove()
    }

    const toast = document.createElement("div")
    toast.className = "copy-toast"
    toast.textContent = message

    if (type === "error") {
      toast.style.backgroundColor = "var(--error-color)"
    }

    document.body.appendChild(toast)

    // Trigger animation
    setTimeout(() => {
      toast.classList.add("show")
    }, 10)

    // Remove toast after 3 seconds
    setTimeout(() => {
      toast.classList.remove("show")
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast)
        }
      }, 300)
    }, 3000)
  }

  // Add event listeners for copy buttons
  document.addEventListener("click", (event) => {
    if (event.target.closest(".copy-btn")) {
      const button = event.target.closest(".copy-btn")
      const targetId = button.getAttribute("data-target")
      const dataType = button.getAttribute("data-type")
      const targetElement = document.getElementById(targetId)

      if (!targetElement) {
        showCopyToast("Target element not found", "error")
        return
      }

      let textToCopy = ""

      if (dataType === "list") {
        // Handle copying from list elements
        const listItems = targetElement.querySelectorAll("li")
        if (listItems.length === 0 || (listItems.length === 1 && listItems[0].textContent.includes("No topics"))) {
          showCopyToast("No topics to copy", "error")
          return
        }

        textToCopy = Array.from(listItems)
          .map((li) => li.textContent.trim())
          .filter((text) => text && !text.includes("No topics"))
          .join("\n")
      } else {
        // Handle copying from textarea elements
        textToCopy = targetElement.value || targetElement.textContent || ""
      }

      copyToClipboard(textToCopy, button)
    }
  })

  // Create animated background particles
  function createParticles() {
    const animatedBg = document.getElementById("animatedBg")
    const particleCount = 50

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("div")
      particle.className = "particle"

      // Random size between 2px and 12px
      const size = Math.random() * 10 + 2
      particle.style.width = size + "px"
      particle.style.height = size + "px"

      // Random position
      particle.style.left = Math.random() * 100 + "%"
      particle.style.top = Math.random() * 100 + "%"

      // Random animation delay
      particle.style.animationDelay = Math.random() * 6 + "s"

      animatedBg.appendChild(particle)
    }
  }

  // Initialize particles
  createParticles()
})
