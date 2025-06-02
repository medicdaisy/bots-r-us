"use client"

import { useEffect } from "react"

export default function HomePage() {
  useEffect(() => {
    window.location.href = "/transcribe.html"
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Redirecting to Finla.ai Transcription...</h1>
        <p>
          If you are not redirected automatically,{" "}
          <a href="/transcribe.html" className="text-blue-600 underline">
            click here
          </a>
          .
        </p>
      </div>
    </div>
  )
}
