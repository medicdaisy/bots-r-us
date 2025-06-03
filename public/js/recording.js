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

  // Copy to clipboard functionality
  function copyToClipboard(text, buttonElement) {
    if (!text || text.trim() === "") {
      showCopyToast("Nothing to copy", "error")
      return
    }

    if (navigator.clipboard && window.isSecureContext) {
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

    setTimeout(() => {
      toast.classList.add("show")
    }, 10)

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
        textToCopy = targetElement.textContent || targetElement.value || ""
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

      const size = Math.random() * 10 + 2
      particle.style.width = size + "px"
      particle.style.height = size + "px"

      particle.style.left = Math.random() * 100 + "%"
      particle.style.top = Math.random() * 100 + "%"

      particle.style.animationDelay = Math.random() * 6 + "s"

      animatedBg.appendChild(particle)
    }
  }

  createParticles()
})
