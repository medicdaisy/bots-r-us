document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const themeToggleCheckbox = document.getElementById("themeToggleCheckbox")
  const loadingState = document.getElementById("loadingState")
  const errorState = document.getElementById("errorState")
  const recordingContent = document.getElementById("recordingContent")
  const recordingTitle = document.getElementById("recordingTitle")
  const recordingDate = document.getElementById("recordingDate")
  const medicalBadge = document.getElementById("medicalBadge")
  const audioPlayer = document.getElementById("audioPlayer")
  const audioElement = document.getElementById("audioElement")
  const polishedContent = document.getElementById("polishedContent")
  const rawContent = document.getElementById("rawContent")
  const multispeakerContent = document.getElementById("multispeakerContent")
  const topicsList = document.getElementById("topicsList")

  // Theme management (same as other pages)
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

  // Tab functionality
  const tabButtons = document.querySelectorAll(".tab-button")
  const tabContents = document.querySelectorAll(".tab-content")

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.getAttribute("data-tab")

      // Remove active class from all tabs and contents
      tabButtons.forEach((btn) => btn.classList.remove("active"))
      tabContents.forEach((content) => content.classList.remove("active"))

      // Add active class to clicked tab and corresponding content
      button.classList.add("active")
      document.getElementById(tabName).classList.add("active")
    })
  })

  // Get recording ID from URL
  const urlParams = new URLSearchParams(window.location.search)
  const recordingId = urlParams.get("id")

  if (!recordingId) {
    showError()
    return
  }

  // Load recording
  async function loadRecording() {
    try {
      const response = await fetch(`/api/recordings/${recordingId}`)
      const data = await response.json()

      if (data.success) {
        displayRecording(data.recording)
      } else {
        showError()
      }
    } catch (error) {
      console.error("Error loading recording:", error)
      showError()
    }
  }

  // Display recording
  function displayRecording(recording) {
    loadingState.style.display = "none"
    recordingContent.style.display = "block"

    // Set title and meta info
    recordingTitle.textContent = recording.title
    document.title = `Dictate - ${recording.title}`

    const date = new Date(recording.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    recordingDate.textContent = date

    // Show medical badge if applicable
    if (recording.is_medical) {
      medicalBadge.style.display = "block"
    }

    // Set up audio player if audio URL exists
    if (recording.audio_url) {
      audioPlayer.style.display = "block"
      audioElement.src = recording.audio_url
    }

    // Set content
    polishedContent.textContent = recording.polished_note || "No polished note available."
    rawContent.textContent = recording.raw_transcription || "No raw transcription available."
    multispeakerContent.textContent = recording.multispeaker_output || "No multi-speaker output available."

    // Set topics
    if (recording.medical_topics && recording.medical_topics.length > 0) {
      topicsList.innerHTML = ""
      recording.medical_topics.forEach((topic) => {
        const li = document.createElement("li")
        li.textContent = topic
        topicsList.appendChild(li)
      })
    } else {
      topicsList.innerHTML = "<li>No topics detected.</li>"
    }
  }

  // Show error state
  function showError() {
    loadingState.style.display = "none"
    errorState.style.display = "block"
  }

  // Initialize
  loadRecording()
})
