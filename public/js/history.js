document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const themeToggleCheckbox = document.getElementById("themeToggleCheckbox")
  const searchInput = document.getElementById("searchInput")
  const loadingState = document.getElementById("loadingState")
  const emptyState = document.getElementById("emptyState")
  const recordingsGrid = document.getElementById("recordingsGrid")

  let allRecordings = []
  let filteredRecordings = []

  // Theme management (same as transcribe.js)
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

  // Load recordings
  async function loadRecordings() {
    try {
      loadingState.style.display = "block"
      emptyState.style.display = "none"
      recordingsGrid.style.display = "none"

      const response = await fetch("/api/recordings")
      const data = await response.json()

      if (data.success) {
        allRecordings = data.recordings
        filteredRecordings = [...allRecordings]
        displayRecordings()
      } else {
        throw new Error(data.error || "Failed to load recordings")
      }
    } catch (error) {
      console.error("Error loading recordings:", error)
      showEmptyState("Error loading recordings. Please try again.")
    } finally {
      loadingState.style.display = "none"
    }
  }

  // Display recordings
  function displayRecordings() {
    if (filteredRecordings.length === 0) {
      showEmptyState()
      return
    }

    recordingsGrid.innerHTML = ""
    recordingsGrid.style.display = "grid"
    emptyState.style.display = "none"

    filteredRecordings.forEach((recording) => {
      const card = createRecordingCard(recording)
      recordingsGrid.appendChild(card)
    })
  }

  // Create recording card
  function createRecordingCard(recording) {
    const card = document.createElement("div")
    card.className = "recording-card"

    const date = new Date(recording.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    const preview = recording.polished_note || recording.raw_transcription || "No content available"
    const truncatedPreview = preview.length > 150 ? preview.substring(0, 150) + "..." : preview

    card.innerHTML = `
      <div class="recording-title">${recording.title}</div>
      <div class="recording-meta">
        <span class="recording-date">${date}</span>
        ${recording.is_medical ? '<span class="medical-badge">Medical</span>' : ""}
      </div>
      <div class="recording-preview">${truncatedPreview}</div>
      <div class="recording-actions">
        <button class="action-btn btn-view" onclick="viewRecording(${recording.id})">View</button>
        ${
          recording.audio_url
            ? `<button class="action-btn btn-play" onclick="playRecording('${recording.audio_url}')">Play</button>`
            : ""
        }
        <button class="action-btn btn-delete" onclick="deleteRecording(${recording.id})">Delete</button>
      </div>
    `

    return card
  }

  // Show empty state
  function showEmptyState(message = null) {
    emptyState.style.display = "block"
    recordingsGrid.style.display = "none"
    if (message) {
      emptyState.querySelector("p").textContent = message
    }
  }

  // Search functionality
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim()

    if (query === "") {
      filteredRecordings = [...allRecordings]
    } else {
      filteredRecordings = allRecordings.filter(
        (recording) =>
          recording.title.toLowerCase().includes(query) ||
          (recording.raw_transcription && recording.raw_transcription.toLowerCase().includes(query)) ||
          (recording.polished_note && recording.polished_note.toLowerCase().includes(query)),
      )
    }

    displayRecordings()
  })

  // Global functions for card actions
  window.viewRecording = (id) => {
    window.location.href = `/recording.html?id=${id}`
  }

  window.playRecording = (audioUrl) => {
    window.open(audioUrl, "_blank")
  }

  window.deleteRecording = async (id) => {
    if (!confirm("Are you sure you want to delete this recording? This action cannot be undone.")) {
      return
    }

    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (data.success) {
        // Remove from local arrays
        allRecordings = allRecordings.filter((r) => r.id !== id)
        filteredRecordings = filteredRecordings.filter((r) => r.id !== id)
        displayRecordings()
      } else {
        alert("Failed to delete recording: " + (data.error || "Unknown error"))
      }
    } catch (error) {
      console.error("Error deleting recording:", error)
      alert("Error deleting recording. Please try again.")
    }
  }

  // Initialize
  loadRecordings()
})
