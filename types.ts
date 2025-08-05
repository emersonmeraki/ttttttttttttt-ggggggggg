
export interface Book {
  id: string;
  title: string;
  unit?: string;
  category: 'book' | 'story' | 'dialogue' | 'translation-study';
  coverImage: string; // Base64 encoded string
  content: string; // Full text content
  translationContent?: string; // For translation-study category
  pageImages?: string[]; // For translation-study category, array of Base64 images
  audioContent?: string; // For translation-study category, base64 encoded audio
  audioMarkers?: number[]; // For translation-study, timestamps in seconds for scene changes
  lastReadPage: number;
  totalLessons?: number; // New: Total number of lessons the book is divided into
  currentLesson?: number; // New: The current lesson the user is on (1-indexed)
}

export interface StudyItem {
  id: string;
  bookId: string;
  originalText: string;
  color: string; // e.g., 'yellow', 'blue'
  context: string;
  pageNumber: number;
  explanation: string;
  exampleSentence: string;
  exampleTranslation: string;
  ipa?: string;
  createdAt: number; // timestamp
}

export interface VocabularyItem {
  id: string;
  bookId: string;
  term: string;
  context:string;
  pageNumber: number;
  definition: string;
  example: string;
  notes: string;
  createdAt: number; // timestamp
}

export interface ExpressionItem {
  id: string;
  bookId: string;
  expression: string;
  explanation: string;
  context: string;
  createdAt: number;
  simpleExample?: string;
  simpleExampleTranslation?: string;
  ipa?: string;
  lessonNumber?: number;
}


export interface AppTheme {
  name: 'light' | 'dark';
  displayName: string;
  classes: {
    bg: string;
    uiBg: string;
    text: string;
    border: string;
    accent: string;
    accentText: string;
    mutedText: string;
  };
}

export interface ReaderTheme {
  name: string;
  displayName:string;
  classes: {
    bg: string;
    text: string;
  };
}

export interface AppSettings {
  appTheme: 'light' | 'dark';
  readerTheme: string;
  customReaderBgUrl: string;
  customReaderBgBlur: number;
  customReaderBgOpacity: number;
  showClockInReader: boolean;
  showCustomCursor: boolean;
  customCursorSize: number;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
}

export interface ElevenLabsSettings {
    apiKey: string;
    voiceId: string;
}
