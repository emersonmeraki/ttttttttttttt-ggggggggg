
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Book, StudyItem, ExpressionItem, AppSettings, AppTheme, ReaderTheme, ElevenLabsSettings } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { LibraryView } from './components/LibraryView';
import { AddBookView } from './components/AddBookView';
import { ReaderView } from './components/ReaderView';
import { StudyWithTranslationView } from './components/StudyWithTranslationView';
import { IpaView } from './components/IpaView';
import { StudyLabView } from './components/StudyLabView';
import { GlossaryView } from './components/GlossaryView';
import { Sidebar } from './components/Sidebar';
import { SettingsView } from './components/SettingsView';
import { ExpressionReviewView } from './components/ExpressionReviewView';
import { IdeasView } from './components/IdeasView';
import { LessonDivisionModal } from './components/LessonDivisionModal';
import { getStudyCardData, generateExpressionsFromText, getIpaPronunciation } from './services/geminiService';
import { getVoices, textToSpeech } from './services/elevenLabsService';
import { getBooks, saveBooks } from './services/dbService';

export const APP_THEMES: AppTheme[] = [
  { 
    name: 'dark', 
    displayName: 'Escuro',
    classes: {
      bg: 'bg-slate-900', uiBg: 'bg-slate-800', text: 'text-slate-300',
      border: 'border-slate-700', accent: 'bg-cyan-600', accentText: 'text-white',
      mutedText: 'text-slate-400'
    },
  },
  { 
    name: 'light', 
    displayName: 'Claro',
    classes: {
      bg: 'bg-slate-100', uiBg: 'bg-white', text: 'text-slate-800',
      border: 'border-slate-300', accent: 'bg-blue-600', accentText: 'text-white',
      mutedText: 'text-slate-500'
    },
  },
];

export const READER_THEMES: ReaderTheme[] = [
  { name: 'light', displayName: 'Gelo', classes: { bg: 'bg-[#f8f8f8]', text: 'text-black/80' } },
  { name: 'sepia', displayName: 'Sépia', classes: { bg: 'bg-[#F5ECD9]', text: 'text-[#3a2f26]' } },
  { name: 'gray', displayName: 'Cinza', classes: { bg: 'bg-[#404040]', text: 'text-[#e5e5e5]' } },
  { name: 'dark', displayName: 'Escuro', classes: { bg: 'bg-[#121212]', text: 'text-white/80' } },
];


const DEFAULT_SETTINGS: AppSettings = {
  appTheme: 'dark',
  readerTheme: 'dark',
  customReaderBgUrl: '',
  customReaderBgBlur: 4,
  customReaderBgOpacity: 0.5,
  showClockInReader: true,
  showCustomCursor: true,
  customCursorSize: 20,
};

const DEFAULT_ELEVENLABS_SETTINGS: ElevenLabsSettings = {
  apiKey: 'sk_03274f4fd2dee158945f8c17b8a0b364527967f146fe7a8c',
  voiceId: 'pMsXgVXv3BLzUgSXRplE', // "Serena" (uma voz feminina popular, usada como "Aria")
};

const CustomCursor: React.FC<{ position: { x: number; y: number }, size: number }> = ({ position, size }) => {
  const cursorStyle: React.CSSProperties = {
    zIndex: 9999,
    position: 'fixed',
    top: 0,
    left: 0,
    pointerEvents: 'none',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    backgroundColor: 'rgba(67, 232, 249, 0.7)', // Semi-transparent cyan, always visible
    transform: `translate(${position.x - size / 2}px, ${position.y - size / 2}px)`,
    transition: 'transform 0.1s ease-out',
  };

  return <div style={cursorStyle} />;
};


export type View = 'library' | 'studyLab' | 'glossary' | 'settings' | 'ideas';

const App: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [isBooksLoaded, setIsBooksLoaded] = useState(false);
  const [studyItems, setStudyItems] = useLocalStorage<StudyItem[]>('minimal-reader-studylab-v5', []);
  const [expressions, setExpressions] = useLocalStorage<ExpressionItem[]>('minimal-reader-expressions-v3', []);
  const [ideas, setIdeas] = useLocalStorage<string[]>('minimal-reader-ideas-v1', []);
  const [appSettings, setAppSettings] = useLocalStorage<AppSettings>('minimal-reader-settings-v5', DEFAULT_SETTINGS);
  const [elevenLabsSettings, setElevenLabsSettings] = useLocalStorage<ElevenLabsSettings>('minimal-reader-elevenlabs-v1', DEFAULT_ELEVENLABS_SETTINGS);
  const [audioCache, setAudioCache] = useLocalStorage<Record<string, string>>('minimal-reader-audio-cache-v1', {});
  const [ipaCache, setIpaCache] = useLocalStorage<Record<string, string>>('minimal-reader-ipa-cache-v1', {});


  const [activeView, setActiveView] = useLocalStorage<View>('minimal-reader-active-view-v1', 'library');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showAddBook, setShowAddBook] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [isStudyLabOpen, setIsStudyLabOpen] = useState(false);
  const [isIpaViewOpen, setIsIpaViewOpen] = useState(false);
  const [ipaViewTerm, setIpaViewTerm] = useState('');
  const [ipaViewBookId, setIpaViewBookId] = useState<string | null>(null);
  const [ipaViewInitialIpa, setIpaViewInitialIpa] = useState<string | null>(null);
  const [isExpressionReviewOpen, setIsExpressionReviewOpen] = useState(false);
  const [expressionReviewBookId, setExpressionReviewBookId] = useState<string | null>(null);
  const [studyLabBookId, setStudyLabBookId] = useState<string | null>(null);
  const [lessonConfig, setLessonConfig] = useState<{ book: Book } | null>(null);
  const [isIpaViewBusy, setIsIpaViewBusy] = useState(false);

  const [mousePosition, setMousePosition] = useState({ x: -100, y: -100 });
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  // Session Timer State
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [timerWasStarted, setTimerWasStarted] = useState(false);

  
  const mainAppRef = useRef<HTMLDivElement>(null);
  const isReading = !!selectedBook;
  
  // Effect for loading books from IndexedDB and migrating from localStorage
  useEffect(() => {
    const loadInitialBooks = async () => {
        let finalBooks: Book[] = [];
        try {
            const LS_BOOKS_KEY = 'minimal-reader-books-v5';
            const lsBooksRaw = localStorage.getItem(LS_BOOKS_KEY);
            if (lsBooksRaw) {
                console.log('Found books in localStorage. Migrating to IndexedDB...');
                const lsBooks = JSON.parse(lsBooksRaw);
                if (Array.isArray(lsBooks) && lsBooks.length > 0) {
                    finalBooks = lsBooks;
                    await saveBooks(finalBooks);
                    localStorage.removeItem(LS_BOOKS_KEY);
                    console.log('Migration successful.');
                } else {
                    finalBooks = await getBooks();
                }
            } else {
                finalBooks = await getBooks();
            }
        } catch (error) {
            console.error('Failed to load or migrate books:', error);
            alert("Não foi possível carregar os livros. Seus dados podem estar corrompidos.");
        } finally {
            const sanitizedBooks = (finalBooks || []).map((book: any): Book => (book.category ? book : { ...book, category: 'book' }));
            setBooks(sanitizedBooks);
            setIsBooksLoaded(true);
        }
    };

    loadInitialBooks();
  }, []); // Run only once on mount
  
  // Effect for saving books to IndexedDB on change
  useEffect(() => {
    if (isBooksLoaded) {
        saveBooks(books).catch(err => {
            console.error('Failed to save books to IndexedDB:', err);
            alert('Falha crítica ao salvar seus conteúdos. As alterações recentes podem não ter sido salvas. O armazenamento do navegador pode estar cheio ou corrompido.');
        });
    }
  }, [books, isBooksLoaded]);
  
  const activeAppTheme = APP_THEMES.find(t => t.name === appSettings.appTheme) || APP_THEMES[0];
  let activeReaderTheme = READER_THEMES.find(t => t.name === appSettings.readerTheme) || READER_THEMES[1];
  if (appSettings.readerTheme === 'custom' && !appSettings.customReaderBgUrl) {
      activeReaderTheme = READER_THEMES[1]; 
  }
  
  const enterFullscreen = useCallback(() => {
    mainAppRef.current?.requestFullscreen().catch(err => {
        console.warn(`Could not enter fullscreen: ${err.message}`);
    });
  }, []);

  useEffect(() => {
    document.body.className = `${activeAppTheme.classes.bg} ${activeAppTheme.classes.text} transition-colors duration-300`;
  }, [activeAppTheme]);
  
  useEffect(() => {
    const validateVoice = async () => {
        if (!elevenLabsSettings.apiKey) {
            return; 
        }

        try {
            const availableVoices = await getVoices(elevenLabsSettings.apiKey);
            if (availableVoices.length > 0) {
                const currentVoiceIsValid = availableVoices.some(v => v.voice_id === elevenLabsSettings.voiceId);
                if (!currentVoiceIsValid) {
                    setElevenLabsSettings(prev => ({ ...prev, voiceId: availableVoices[0].voice_id }));
                }
            } else {
                console.warn("No voices found for the provided ElevenLabs API key.");
                if (elevenLabsSettings.voiceId) {
                    setElevenLabsSettings(prev => ({ ...prev, voiceId: '' }));
                }
            }
        } catch (error) {
            console.error("Failed to validate ElevenLabs voice, likely an invalid API key:", error);
            if (elevenLabsSettings.voiceId) {
                setElevenLabsSettings(prev => ({ ...prev, voiceId: '' }));
            }
        }
    };
    
    validateVoice();
  }, [elevenLabsSettings.apiKey, setElevenLabsSettings]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Control') setIsCtrlPressed(true);

          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
              return;
          }

          if (e.ctrlKey && e.key.toLowerCase() === 'x') {
              if (selectedBook) {
                  e.preventDefault();
                  setSelectedBook(null);
                  return;
              }
          }

          if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            if (!document.fullscreenElement) {
              enterFullscreen();
            } else {
              if (document.exitFullscreen) {
                document.exitFullscreen();
              }
            }
          }
      };
      
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Control') setIsCtrlPressed(false);
      }

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      }
  }, [enterFullscreen, selectedBook]);
  
  const handleOpenStudyLab = (bookId: string | null) => {
    setStudyLabBookId(bookId);
    setIsStudyLabOpen(true);
  };

  const handleCloseStudyLab = () => {
    setIsStudyLabOpen(false);
    setStudyLabBookId(null);
  };
  
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePosition({ x: e.clientX, y: e.clientY });
        };
        
        if (isReading) { 
            window.addEventListener('mousemove', handleMouseMove);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [isReading]);

    useEffect(() => {
        if (isReading && isCtrlPressed && appSettings.showCustomCursor) {
            document.body.classList.add('custom-cursor-active');
        } else {
            document.body.classList.remove('custom-cursor-active');
        }
    }, [isReading, isCtrlPressed, appSettings.showCustomCursor]);

  const handleUpdateBook = useCallback((updatedBook: Book) => {
    setBooks(prevBooks => (prevBooks || []).map(b => b.id === updatedBook.id ? updatedBook : b));
  }, []);

  const handleOpenAddBook = () => {
    setEditingBook(null);
    setShowAddBook(true);
  };
  
  const handleOpenEditBook = (book: Book) => {
    setEditingBook(book);
    setShowAddBook(true);
  };

  const handleSaveBook = (bookData: Book) => {
    const bookExists = books.some(b => b.id === bookData.id);
    if (bookExists) {
        handleUpdateBook(bookData);
    } else {
        setBooks(prev => [...(prev || []), bookData]);
    }
    setShowAddBook(false);
    setEditingBook(null);
  };

  const handleCancelBookForm = () => {
    setShowAddBook(false);
    setEditingBook(null);
  };

  const handleSelectBook = (book: Book) => {
    if (!book.totalLessons) {
      setLessonConfig({ book });
    } else {
      setSelectedBook(book);
      setSessionStartTime(null);
      setTimerWasStarted(false); 
    }
  };

  const handleStartSession = useCallback((bookToUpdate: Book, numLessons: number) => {
    let updatedBook: Book | null = null;
    setBooks(prevBooks => {
        const newBooks = prevBooks.map(b => {
            if (b.id === bookToUpdate.id) {
                updatedBook = { ...b, totalLessons: numLessons, currentLesson: 1 };
                return updatedBook;
            }
            return b;
        });
        return newBooks;
    });

    if (updatedBook) {
        setSelectedBook(updatedBook);
        setSessionStartTime(null);
        setTimerWasStarted(false);
    }
    setLessonConfig(null);
  }, []);

  const handleAdvanceLesson = useCallback((bookId: string) => {
    let nextLessonBook: Book | null = null;
    setBooks(prevBooks => {
        return prevBooks.map(b => {
            if (b.id === bookId) {
                const nextLesson = (b.currentLesson || 0) + 1;
                if (nextLesson <= (b.totalLessons || 1)) {
                    nextLessonBook = { ...b, currentLesson: nextLesson, lastReadPage: 0 }; 
                    return nextLessonBook;
                }
            }
            return b;
        });
    });
    
    if (nextLessonBook) {
        setSelectedBook(nextLessonBook);
        setSessionStartTime(null);
        setTimerWasStarted(false);
    }
  }, []);


  const startTimer = useCallback(() => {
    setSessionStartTime(prev => {
        if (prev) {
            return null;
        } else {
            setTimerWasStarted(true);
            return Date.now();
        }
    });
  }, []);

  useEffect(() => {
    let timerInterval: number;
    if (sessionStartTime) {
        timerInterval = window.setInterval(() => {
            const diffSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
            const minutes = String(Math.floor(diffSeconds / 60)).padStart(2, '0');
            const seconds = String(diffSeconds % 60).padStart(2, '0');
            setElapsedTime(`${minutes}:${seconds}`);
        }, 1000);
    } else {
        setElapsedTime('00:00');
    }
    return () => clearInterval(timerInterval);
  }, [sessionStartTime]);


  const handleAddStudyItem = useCallback((item: Omit<StudyItem, 'id' | 'createdAt'>) => {
    return new Promise<void>((resolve, reject) => {
      setStudyItems(currentStudyItems => {
        const alreadyExists = (currentStudyItems || []).some(
          si => si && typeof si === 'object' && si.bookId === item.bookId && si.originalText.trim().toLowerCase() === item.originalText.trim().toLowerCase()
        );

        if (alreadyExists) {
          reject(new Error("Este termo já foi salvo no seu laboratório."));
          return currentStudyItems;
        }

        const newStudyItemId = Date.now().toString();
        const newStudyItem: StudyItem = {
          ...item,
          id: newStudyItemId,
          createdAt: Date.now(),
          ipa: '',
        };

        getStudyCardData(item.originalText, item.context)
          .then(cardData => {
            if (cardData && typeof cardData === 'object') {
              setStudyItems(prev => (prev || []).map(si =>
                si && typeof si === 'object' && si.id === newStudyItemId ? { ...si, ...cardData } : si
              ));
            }
          })
          .catch(error => {
            console.error("Background fetch for study item failed:", error);
          });
        
        if (elevenLabsSettings.apiKey && elevenLabsSettings.voiceId) {
            textToSpeech(elevenLabsSettings.apiKey, item.originalText, elevenLabsSettings.voiceId)
                .then(audioBlob => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64data = reader.result as string;
                        const cacheKey = `${item.bookId}::${item.originalText.toLowerCase()}`;
                        setAudioCache(prev => ({ ...(prev || {}), [cacheKey]: base64data }));
                    };
                    reader.readAsDataURL(audioBlob);
                })
                .catch(error => {
                    console.error(`Background audio generation for "${item.originalText}" failed:`, error);
                });
        }
        
        resolve();
        return [newStudyItem, ...(currentStudyItems || [])];
      });
    });
  }, [setStudyItems, elevenLabsSettings, setAudioCache]);

  const handleUpdateStudyItem = useCallback((updatedItem: StudyItem) => {
    setStudyItems(prev => (prev || []).map(item => item.id === updatedItem.id ? { ...item, ...updatedItem } : item));
  }, [setStudyItems]);
  
  const handleUpdateExpressionItem = useCallback((updatedItem: ExpressionItem) => {
    setExpressions(prev => (prev || []).map(item => item.id === updatedItem.id ? { ...item, ...updatedItem } : item));
  }, [setExpressions]);

  const handleDeleteStudyItem = useCallback((itemId: string) => {
      setStudyItems(prev => (prev || []).filter(item => item.id !== itemId));
  }, [setStudyItems]);
  
  const handleDeleteExpression = useCallback((expressionId: string) => {
      setExpressions(prev => (prev || []).filter(item => item.id !== expressionId));
  }, [setExpressions]);

  const handleGenerateExpressions = useCallback(async (book: Book, lessonContent?: string) => {
    const contentToAnalyze = lessonContent || book.content;
    const results = await generateExpressionsFromText(contentToAnalyze);
    
    if (results) {
        // VALIDATION: Ensure every expression returned by the AI is actually in the source text.
        // This prevents the AI from hallucinating expressions and creating a mismatch.
        const validatedResults = results.filter(res => {
            if (!res.expression || !res.expression.trim()) return false;
            // Use a case-insensitive search to confirm the expression exists in the text.
            return contentToAnalyze.toLowerCase().includes(res.expression.trim().toLowerCase());
        });

        // If after validation no expressions are left, inform the user.
        if (validatedResults.length === 0) {
            throw new Error("A IA analisou o texto, mas não encontrou expressões idiomáticas relevantes para criar um glossário.");
        }

        const newExpressions: ExpressionItem[] = validatedResults.map((res, index) => ({
            ...res,
            expression: res.expression.trim(), // Trim the expression before saving
            id: `${book.id}-${book.currentLesson}-${res.expression.trim().replace(/\s/g, '-')}-${Date.now() + index}`,
            bookId: book.id,
            createdAt: Date.now(),
            lessonNumber: book.currentLesson,
        }));
        
        // Remove old expressions for the current lesson and add the new, validated ones.
        setExpressions(prev => [
            ...(prev || []).filter(e => !(e.bookId === book.id && e.lessonNumber === book.currentLesson)),
            ...newExpressions
        ]);
    } else {
        throw new Error("A IA não retornou expressões.");
    }
  }, [setExpressions]);
  
  const handleOpenExpressionReview = (bookId: string | null = null) => {
    setExpressionReviewBookId(bookId);
    setIsExpressionReviewOpen(true);
  };
  
  const handleStartExpressionReviewFromStudyLab = (bookId: string | null) => {
    setIsStudyLabOpen(false);
    requestAnimationFrame(() => {
        const finalBookId = studyLabBookId || bookId;
        handleOpenExpressionReview(finalBookId);
    });
  };

  const handleOpenIpaView = (term: string, bookId: string) => {
    if (isIpaViewBusy || isIpaViewOpen) return;

    const existingStudyItem = studyItems.find(
      item => item.bookId === bookId && item.originalText.trim().toLowerCase() === term.trim().toLowerCase()
    );
    const cachedIpa = ipaCache[term.trim().toLowerCase()];

    setIpaViewTerm(term);
    setIpaViewBookId(bookId);
    setIpaViewInitialIpa(existingStudyItem?.ipa || cachedIpa || null);
    setIsIpaViewOpen(true);
    setIsIpaViewBusy(true);
  }

  return (
    <div className="flex min-h-screen" ref={mainAppRef}>
        {isReading && isCtrlPressed && appSettings.showCustomCursor && <CustomCursor position={mousePosition} size={appSettings.customCursorSize} />}
        <Sidebar activeView={activeView} setActiveView={setActiveView} theme={activeAppTheme} />
        
        <main className="flex-1">
            {activeView === 'library' && (
                <LibraryView 
                    books={books || []}
                    onAddBook={handleOpenAddBook}
                    onEditBook={handleOpenEditBook}
                    onSelectBook={handleSelectBook}
                    theme={activeAppTheme}
                />
            )}
            {activeView === 'studyLab' && (
                <StudyLabView
                    items={studyItems || []}
                    books={books || []}
                    onDelete={handleDeleteStudyItem}
                    onUpdate={handleUpdateStudyItem}
                    onClose={() => setActiveView('library')}
                    isOverlay={false}
                    theme={activeAppTheme}
                    elevenLabsSettings={elevenLabsSettings}
                    audioCache={audioCache}
                    setAudioCache={setAudioCache}
                    onStartExpressionReview={handleStartExpressionReviewFromStudyLab}
                />
            )}
            {activeView === 'glossary' && (
                <GlossaryView
                    expressions={expressions || []}
                    setExpressions={setExpressions}
                    books={books || []}
                    onDelete={handleDeleteExpression}
                    onUpdate={handleUpdateExpressionItem}
                    onStartReview={handleOpenExpressionReview}
                    theme={activeAppTheme}
                />
            )}
             {activeView === 'ideas' && (
              <IdeasView
                ideas={ideas || []}
                setIdeas={setIdeas}
                theme={activeAppTheme}
              />
            )}
            {activeView === 'settings' && (
              <SettingsView 
                appSettings={appSettings}
                setAppSettings={setAppSettings}
                elevenLabsSettings={elevenLabsSettings}
                setElevenLabsSettings={setElevenLabsSettings}
                books={books || []}
                studyItems={studyItems || []}
                expressions={expressions || []}
                ideas={ideas || []}
                audioCache={audioCache}
                setBooks={setBooks}
                setStudyItems={setStudyItems}
                setExpressions={setExpressions}
                setIdeas={setIdeas}
                setAudioCache={setAudioCache}
                theme={activeAppTheme}
                appThemes={APP_THEMES}
                readerThemes={READER_THEMES}
              />
            )}
        </main>

        {showAddBook && (
            <AddBookView 
                onSaveBook={handleSaveBook} 
                onCancel={handleCancelBookForm}
                bookToEdit={editingBook}
                theme={activeAppTheme}
            />
        )}

        {lessonConfig && (
          <LessonDivisionModal 
            book={lessonConfig.book}
            onClose={() => setLessonConfig(null)}
            onStartSession={handleStartSession}
            theme={activeAppTheme}
          />
        )}

        {selectedBook && selectedBook.category === 'translation-study' && (
            <StudyWithTranslationView
                book={selectedBook}
                studyItems={studyItems || []}
                expressions={expressions || []}
                readerTheme={activeReaderTheme}
                appTheme={activeAppTheme}
                appSettings={appSettings}
                elevenLabsSettings={elevenLabsSettings}
                audioCache={audioCache}
                isStudyLabOpen={isStudyLabOpen}
                sessionStartTime={sessionStartTime}
                elapsedTime={elapsedTime}
                showTimerReminder={!sessionStartTime}
                timerWasStarted={timerWasStarted}
                onClose={() => setSelectedBook(null)}
                onUpdateBook={handleUpdateBook}
                onAddStudyItem={handleAddStudyItem}
                onOpenStudyLab={() => handleOpenStudyLab(selectedBook.id)}
                setAudioCache={setAudioCache}
                onOpenIpaView={handleOpenIpaView}
                onGenerateExpressions={handleGenerateExpressions}
                onOpenExpressionReview={handleOpenExpressionReview}
                onStartTimer={startTimer}
                onAdvanceLesson={handleAdvanceLesson}
                onCloseStudyLab={handleCloseStudyLab}
                isIpaViewOpen={isIpaViewOpen}
                onCloseIpaView={() => setIsIpaViewOpen(false)}
                isExpressionReviewOpen={isExpressionReviewOpen}
                onCloseExpressionReview={() => setIsExpressionReviewOpen(false)}
            />
        )}

        {selectedBook && selectedBook.category !== 'translation-study' && (
            <ReaderView
                book={selectedBook}
                studyItems={studyItems || []}
                expressions={expressions || []}
                readerTheme={activeReaderTheme}
                appTheme={activeAppTheme}
                appSettings={appSettings}
                elevenLabsSettings={elevenLabsSettings}
                audioCache={audioCache}
                isStudyLabOpen={isStudyLabOpen}
                sessionStartTime={sessionStartTime}
                elapsedTime={elapsedTime}
                showTimerReminder={!sessionStartTime}
                timerWasStarted={timerWasStarted}
                onClose={() => setSelectedBook(null)}
                onUpdateBook={handleUpdateBook}
                onAddStudyItem={handleAddStudyItem}
                onOpenStudyLab={() => handleOpenStudyLab(selectedBook.id)}
                onOpenExpressionReview={handleOpenExpressionReview}
                onGenerateExpressions={handleGenerateExpressions}
                setAudioCache={setAudioCache}
                onOpenIpaView={handleOpenIpaView}
                onStartTimer={startTimer}
                onAdvanceLesson={handleAdvanceLesson}
                onCloseStudyLab={handleCloseStudyLab}
                isIpaViewOpen={isIpaViewOpen}
                onCloseIpaView={() => setIsIpaViewOpen(false)}
                isExpressionReviewOpen={isExpressionReviewOpen}
                onCloseExpressionReview={() => setIsExpressionReviewOpen(false)}
            />
        )}

        {isStudyLabOpen && (
             <StudyLabView
                items={studyItems || []}
                books={books || []}
                onDelete={handleDeleteStudyItem}
                onUpdate={handleUpdateStudyItem}
                onClose={handleCloseStudyLab}
                isOverlay={true}
                theme={activeAppTheme}
                elevenLabsSettings={elevenLabsSettings}
                audioCache={audioCache}
                setAudioCache={setAudioCache}
                onStartExpressionReview={handleStartExpressionReviewFromStudyLab}
                bookIdForSession={studyLabBookId}
            />
        )}

        {isExpressionReviewOpen && (
            <ExpressionReviewView
                items={expressions || []}
                bookId={expressionReviewBookId}
                books={books || []}
                onDelete={handleDeleteExpression}
                onExit={() => setIsExpressionReviewOpen(false)}
                theme={activeAppTheme}
            />
        )}

        {isIpaViewOpen && (
            <IpaView
                term={ipaViewTerm}
                bookId={ipaViewBookId}
                initialIpa={ipaViewInitialIpa}
                elevenLabsSettings={elevenLabsSettings}
                getIpaFn={getIpaPronunciation}
                onClose={() => {
                    setIsIpaViewOpen(false);
                    setTimeout(() => setIsIpaViewBusy(false), 500);
                }}
                theme={activeAppTheme}
                audioCache={audioCache}
                setAudioCache={setAudioCache}
                setIpaCache={setIpaCache}
            />
        )}
    </div>
  );
};

export default App;
