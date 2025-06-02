# Finla.ai Advanced Transcription System

A comprehensive audio transcription platform with advanced analysis capabilities including sentiment analysis, speaker diarization, topic detection, and voice activity detection (VAD).

## 🚀 Features

### Core Transcription Services
- **Google Gemini (1.5-Flash)** - Optimized for long-form audio content
- **OpenAI Whisper** - Industry-standard speech recognition
- **Deepgram Nova-3** - Real-time capable transcription with advanced features

### Advanced Analysis
- **Sentiment Analysis** - Emotional tone detection across audio segments
- **Speaker Diarization** - Multi-speaker identification and labeling
- **Topic Detection** - Automatic extraction of key themes and subjects
- **Voice Activity Detection (VAD)** - Speech vs. silence segmentation
- **Medical Content Analysis** - Specialized healthcare terminology detection

### User Interface
- **Real-time Audio Visualization** - Live waveform display during recording
- **Multi-format Audio Upload** - Support for various audio file formats
- **Responsive Design** - Optimized for desktop and mobile devices
- **Dark/Light Theme** - User preference-based theming
- **Recording History** - Complete transcription management system

### Data Management
- **Database Storage** - Comprehensive recording metadata and analysis
- **Blob Storage** - Secure audio file storage with Vercel Blob
- **Export Capabilities** - Multiple format export options
- **Search & Filter** - Advanced recording discovery features

## 🏗️ Architecture

### Frontend
- **HTML/CSS/JavaScript** - Modern vanilla web technologies
- **Canvas API** - Real-time audio visualization
- **MediaRecorder API** - Browser-native audio recording
- **Responsive CSS Grid/Flexbox** - Adaptive layout system

### Backend
- **Next.js 15** - Full-stack React framework with App Router
- **TypeScript** - Type-safe development
- **Server Actions** - Secure server-side operations
- **API Routes** - RESTful endpoint architecture

### Database
- **Neon PostgreSQL** - Serverless PostgreSQL database
- **Advanced Schema** - Optimized for audio analysis data
- **Indexing Strategy** - Performance-optimized queries

### Storage
- **Vercel Blob** - Scalable file storage for audio files
- **CDN Distribution** - Global content delivery

### AI/ML Services
- **Google Gemini API** - Advanced language model integration
- **OpenAI Whisper API** - Speech-to-text processing
- **Deepgram API** - Real-time transcription services

## 📊 Database Schema

### Core Tables

#### `recordings`
Primary table for transcription data and metadata.

\`\`\`sql
CREATE TABLE recordings (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  raw_transcription TEXT,
  polished_note TEXT,
  multispeaker_output TEXT,
  medical_topics JSONB DEFAULT '[]',
  is_medical BOOLEAN DEFAULT FALSE,
  audio_url TEXT,
  service_used VARCHAR(50),
  sentiment_analysis JSONB DEFAULT '{}',
  speaker_diarization JSONB DEFAULT '{}',
  topic_detection JSONB DEFAULT '{}',
  vad_segments JSONB DEFAULT '[]',
  audio_metadata JSONB DEFAULT '{}',
  processing_status VARCHAR(50) DEFAULT 'completed',
  confidence_score DECIMAL(3,2),
  language_detected VARCHAR(10),
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  audio_format VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

#### `speakers`
Speaker diarization results and voice characteristics.

\`\`\`sql
CREATE TABLE speakers (
  id SERIAL PRIMARY KEY,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
  speaker_id VARCHAR(50) NOT NULL,
  speaker_label VARCHAR(100),
  total_duration DECIMAL(10,2),
  segments_count INTEGER DEFAULT 0,
  confidence_score DECIMAL(3,2),
  voice_characteristics JSONB DEFAULT '{}'
);
\`\`\`

#### `segments`
Detailed time-stamped analysis of audio segments.

\`\`\`sql
CREATE TABLE segments (
  id SERIAL PRIMARY KEY,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
  speaker_id INTEGER REFERENCES speakers(id) ON DELETE CASCADE,
  start_time DECIMAL(10,3) NOT NULL,
  end_time DECIMAL(10,3) NOT NULL,
  text TEXT NOT NULL,
  confidence DECIMAL(3,2),
  sentiment JSONB DEFAULT '{}',
  topics JSONB DEFAULT '[]',
  is_speech BOOLEAN DEFAULT TRUE,
  word_count INTEGER DEFAULT 0
);
\`\`\`

#### `analytics`
Comprehensive insights and summary data.

\`\`\`sql
CREATE TABLE analytics (
  id SERIAL PRIMARY KEY,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
  total_speakers INTEGER DEFAULT 1,
  speech_percentage DECIMAL(5,2),
  silence_percentage DECIMAL(5,2),
  average_sentiment DECIMAL(3,2),
  dominant_emotion VARCHAR(50),
  key_topics JSONB DEFAULT '[]',
  summary TEXT,
  insights JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

## 🔧 API Documentation

### Transcription Endpoints

#### `POST /api/transcribe`
Process audio with advanced analysis capabilities.

**Request:**
\`\`\`typescript
FormData {
  audio: File,
  service: 'gemini' | 'openai_whisper' | 'deepgram_nova',
  enableMedical: boolean,
  enableMultiSpeaker: boolean
}
\`\`\`

**Response:**
\`\`\`typescript
{
  success: boolean,
  rawTranscription: string,
  polishedNote: string,
  multiSpeakerOutput: string,
  medicalTopics: string[],
  service: string,
  error?: string
}
\`\`\`

### Recording Management

#### `GET /api/recordings`
Retrieve recordings with pagination and filtering.

**Query Parameters:**
- `limit` (number): Maximum records to return (default: 50)
- `offset` (number): Records to skip (default: 0)

**Response:**
\`\`\`typescript
{
  success: boolean,
  recordings: Recording[],
  error?: string
}
\`\`\`

#### `GET /api/recordings/[id]`
Get specific recording details.

**Response:**
\`\`\`typescript
{
  success: boolean,
  recording: Recording,
  error?: string
}
\`\`\`

#### `PUT /api/recordings/[id]`
Update recording information.

**Request:**
\`\`\`typescript
{
  title?: string,
  raw_transcription?: string,
  polished_note?: string,
  multispeaker_output?: string
}
\`\`\`

#### `DELETE /api/recordings/[id]`
Delete recording and associated data.

### Storage Management

#### `POST /api/save-recording`
Save audio file and transcription data.

**Request:**
\`\`\`typescript
FormData {
  audio: File,
  transcriptionData: string // JSON stringified transcription data
}
\`\`\`

**Response:**
\`\`\`typescript
{
  success: boolean,
  recordingId: number,
  audioUrl: string,
  title: string,
  error?: string
}
\`\`\`

## 🚀 Deployment Guide

### Prerequisites
- Node.js 18+ 
- Vercel account
- Neon PostgreSQL database
- API keys for transcription services

### Environment Variables

Create a `.env.local` file with the following variables:

\`\`\`env
# Database
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]
POSTGRES_URL=postgresql://[user]:[password]@[host]/[database]
POSTGRES_PRISMA_URL=postgresql://[user]:[password]@[host]/[database]
POSTGRES_URL_NON_POOLING=postgresql://[user]:[password]@[host]/[database]

# Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_token

# AI Services
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key

# Public Keys (for client-side usage)
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
\`\`\`

### Database Setup

1. **Create Database Schema:**
\`\`\`bash
# Execute the SQL schema files in order
psql $DATABASE_URL -f schema/01_recordings.sql
psql $DATABASE_URL -f schema/02_speakers.sql
psql $DATABASE_URL -f schema/03_segments.sql
psql $DATABASE_URL -f schema/04_analytics.sql
psql $DATABASE_URL -f schema/05_indexes.sql
\`\`\`

2. **Verify Tables:**
\`\`\`sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
\`\`\`

### Vercel Deployment

1. **Install Vercel CLI:**
\`\`\`bash
npm i -g vercel
\`\`\`

2. **Deploy:**
\`\`\`bash
vercel --prod
\`\`\`

3. **Configure Environment Variables:**
\`\`\`bash
vercel env add GEMINI_API_KEY
vercel env add OPENAI_API_KEY
vercel env add DEEPGRAM_API_KEY
vercel env add DATABASE_URL
vercel env add BLOB_READ_WRITE_TOKEN
\`\`\`

## 🔒 Security Considerations

### API Key Management
- All sensitive API keys are server-side only
- Client-side code uses secure server actions
- Environment variables are properly scoped

### Data Protection
- Audio files stored with access controls
- Database connections use SSL
- User data is encrypted in transit

### Input Validation
- File type validation for uploads
- Size limits on audio files
- SQL injection prevention with parameterized queries

## 🎯 Usage Examples

### Basic Recording
\`\`\`javascript
// Start recording
await startRecording();

// Stop and transcribe
await stopRecording();
\`\`\`

### File Upload
\`\`\`javascript
// Upload and process audio file
const file = document.getElementById('audioFile').files[0];
await processAudio(file);
\`\`\`

### Advanced Analysis
\`\`\`javascript
// Enable medical topic detection
document.getElementById('topicMedical').checked = true;

// Enable multi-speaker analysis
document.getElementById('topicMultiSpeaker').checked = true;

// Process with advanced features
await transcribeAudio(audioBlob, {
  enableMedical: true,
  enableMultiSpeaker: true
});
\`\`\`

## 🔧 Development Setup

### Local Development

1. **Clone Repository:**
\`\`\`bash
git clone [repository-url]
cd dictate
\`\`\`

2. **Install Dependencies:**
\`\`\`bash
npm install
\`\`\`

3. **Setup Environment:**
\`\`\`bash
cp .env.example .env.local
# Edit .env.local with your credentials
\`\`\`

4. **Run Development Server:**
\`\`\`bash
npm run dev
\`\`\`

5. **Access Application:**
\`\`\`
http://localhost:3000
\`\`\`

### Testing

#### Unit Tests
\`\`\`bash
npm run test
\`\`\`

#### Integration Tests
\`\`\`bash
npm run test:integration
\`\`\`

#### E2E Tests
\`\`\`bash
npm run test:e2e
\`\`\`

## 📈 Performance Optimization

### Frontend Optimizations
- **Lazy Loading** - Components loaded on demand
- **Code Splitting** - Reduced initial bundle size
- **Image Optimization** - WebP format with fallbacks
- **Caching Strategy** - Service worker implementation

### Backend Optimizations
- **Database Indexing** - Optimized query performance
- **Connection Pooling** - Efficient database connections
- **CDN Integration** - Global content delivery
- **Compression** - Gzip/Brotli compression

### Audio Processing
- **Streaming Upload** - Large file handling
- **Format Optimization** - Automatic audio compression
- **Parallel Processing** - Concurrent transcription services

## 🐛 Troubleshooting

### Common Issues

#### Microphone Access Denied
\`\`\`javascript
// Check browser permissions
navigator.permissions.query({name: 'microphone'})
  .then(result => console.log(result.state));
\`\`\`

#### API Rate Limits
- Implement exponential backoff
- Use service rotation for high volume
- Monitor usage quotas

#### Database Connection Issues
\`\`\`bash
# Test database connectivity
psql $DATABASE_URL -c "SELECT 1;"
\`\`\`

#### Audio Format Compatibility
- Ensure browser supports MediaRecorder
- Provide format fallbacks
- Validate file types on upload

### Debug Mode
Enable debug logging:
\`\`\`javascript
localStorage.setItem('debug', 'true');
\`\`\`

## 📚 Additional Resources

### API Documentation
- [Google Gemini API](https://ai.google.dev/docs)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [Deepgram API](https://developers.deepgram.com/)

### Browser APIs
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

### Database Resources
- [Neon Documentation](https://neon.tech/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch
3. Implement changes
4. Add tests
5. Submit pull request

### Code Standards
- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting
- Conventional commits

### Testing Requirements
- Unit test coverage > 80%
- Integration tests for API endpoints
- E2E tests for critical user flows

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting guide
- Review the API documentation
- Contact the development team

---

**Built with ❤️ by the Finla.ai team**
\`\`\`
