/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, List, Type, Search, BookOpen, Moon, Sun, ListOrdered, X, Loader2, Bookmark as BookmarkIcon, Trash2 } from 'lucide-react';
import { Surah, Ayah, SurahDetail, TranslationAyah, Bookmark } from './types';

const API_BASE = 'https://api.alquran.cloud/v1';

export default function App() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [surahDetail, setSurahDetail] = useState<SurahDetail | null>(null);
  const [translation, setTranslation] = useState<TranslationAyah[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState(32);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isTajweedEnabled, setIsTajweedEnabled] = useState(true);
  const [isVerseSelectorOpen, setIsVerseSelectorOpen] = useState(false);
  const [verseSearchQuery, setVerseSearchQuery] = useState('');
  const [tajweedAyahs, setTajweedAyahs] = useState<Record<number, string>>({});
  const [tajweedLoading, setTajweedLoading] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    const saved = localStorage.getItem('quran_bookmarks');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentTab, setCurrentTab] = useState<'quran' | 'bookmarks'>('quran');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    localStorage.setItem('quran_bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    fetchSurahs();
  }, []);

  useEffect(() => {
    if (selectedSurah) {
      window.scrollTo(0, 0);
      setTajweedAyahs({}); // Clear on surah change to avoid stale data
      fetchSurahDetail(selectedSurah);
      if (isTajweedEnabled) {
        fetchTajweed(selectedSurah);
      }
    }
  }, [selectedSurah]);

  useEffect(() => {
    if (selectedSurah && isTajweedEnabled && Object.keys(tajweedAyahs).length === 0 && !tajweedLoading) {
      fetchTajweed(selectedSurah);
    }
  }, [isTajweedEnabled, selectedSurah, tajweedAyahs, tajweedLoading]);

  const fetchSurahs = async () => {
    try {
      const res = await fetch(`${API_BASE}/surah`);
      const data = await res.json();
      setSurahs(data.data);
    } catch (err) {
      console.error('Failed to fetch surahs', err);
    }
  };

  const fetchTajweed = async (number: number) => {
    setTajweedLoading(true);
    console.log(`Fetching tajweed from Al-Quran Cloud for surah ${number}...`);
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/surah/${number}/quran-tajweed`);
      if (!res.ok) throw new Error('Al-Quran Cloud Tajweed API failed');
      const data = await res.json();
      
      const mapping: Record<number, string> = {};
      data.data.ayahs.forEach((ayah: any) => {
        // Parse custom tajweed format: [rule:index[text]] or [rule[text]]
        // to: <span class="tajweed-rule">text</span>
        let parsedText = ayah.text;
        
        // Use a regex that handles nested patterns if they occur, though Al-Quran Cloud is usually simple
        // Format is [rule[text]] or [rule:index[text]]
        // The regex looks for [code[content]]
        let previous;
        do {
          previous = parsedText;
          // Matches [rule:optionalIndex[content]]
          // FIXED: One closing bracket instead of two
          parsedText = parsedText.replace(/\[([a-z0-9]+)(?::\d+)?\[([^\]\[]+)\]/g, '<span class="tajweed-$1">$2</span>');
        } while (parsedText !== previous);
        
        mapping[ayah.numberInSurah] = parsedText;
      });
      setTajweedAyahs(mapping);
    } catch (err) {
      console.error('Failed to fetch tajweed', err);
    } finally {
      setTajweedLoading(false);
    }
  };

  const fetchSurahDetail = async (number: number) => {
    setLoading(true);
    try {
      // Fetch Arabic text
      const arabicRes = await fetch(`${API_BASE}/surah/${number}`);
      const arabicData = await arabicRes.json();
      
      // Fetch Indonesian translation (id.indonesian)
      const transRes = await fetch(`${API_BASE}/surah/${number}/id.indonesian`);
      const transData = await transRes.json();

      setSurahDetail(arabicData.data);
      setTranslation(transData.data.ayahs);
    } catch (err) {
      console.error('Failed to fetch surah detail', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleBookmark = (ayah: Ayah, surah: Surah) => {
    const isBookmarked = bookmarks.some(b => b.surahNumber === surah.number && b.ayahNumber === ayah.numberInSurah);
    if (isBookmarked) {
      setBookmarks(prev => prev.filter(b => !(b.surahNumber === surah.number && b.ayahNumber === ayah.numberInSurah)));
      setToast({ message: 'Bookmark dihapus', type: 'info' });
    } else {
      const newBookmark: Bookmark = {
        surahNumber: surah.number,
        ayahNumber: ayah.numberInSurah,
        surahName: surah.englishName,
        ayahText: ayah.text,
        timestamp: Date.now()
      };
      setBookmarks(prev => [newBookmark, ...prev]);
      setToast({ message: 'Ayat disimpan', type: 'success' });
    }
  };

  const removeBookmark = (surahNum: number, ayahNum: number) => {
    setBookmarks(prev => prev.filter(b => !(b.surahNumber === surahNum && b.ayahNumber === ayahNum)));
    setToast({ message: 'Bookmark dihapus', type: 'info' });
  };

  const goToBookmark = (bookmark: Bookmark) => {
    setSelectedSurah(bookmark.surahNumber);
    setCurrentTab('quran');
    
    // Use a more robust way to wait for the content to load
    const checkAndScroll = (attempts = 0) => {
      const element = document.getElementById(`ayah-${bookmark.ayahNumber}`);
      if (element) {
        const headerOffset = 80;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      } else if (attempts < 20) { // Try for up to 2 seconds
        setTimeout(() => checkAndScroll(attempts + 1), 100);
      }
    };
    
    checkAndScroll();
  };

  const filteredSurahs = useMemo(() => {
    return surahs.filter(s => 
      s.englishName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.number.toString().includes(searchQuery)
    );
  }, [surahs, searchQuery]);

  const filteredVerses = useMemo(() => {
    if (!surahDetail) return [];
    const verses = Array.from({ length: surahDetail.numberOfAyahs }, (_, i) => i + 1);
    if (!verseSearchQuery) return verses;
    return verses.filter(v => v.toString().includes(verseSearchQuery));
  }, [surahDetail, verseSearchQuery]);

  const handleBack = () => {
    setSelectedSurah(null);
    setSurahDetail(null);
    setTranslation([]);
    setTajweedAyahs({});
    setIsVerseSelectorOpen(false);
  };

  const scrollToVerse = (verseNumber: number) => {
    setIsVerseSelectorOpen(false);
    setVerseSearchQuery('');
    setTimeout(() => {
      const element = document.getElementById(`ayah-${verseNumber}`);
      if (element) {
        const headerOffset = 80;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-stone-950 text-stone-100' : 'bg-stone-50 text-stone-900'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-md ${isDarkMode ? 'bg-stone-900/80 border-stone-800' : 'bg-white/80 border-stone-200'}`}>
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedSurah ? (
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleBack}
                  className={`p-2 rounded-full hover:bg-stone-200/50 transition-colors ${isDarkMode ? 'hover:bg-stone-800' : ''}`}
                  id="back-button"
                >
                  <ChevronLeft size={24} />
                </button>
                <button 
                  onClick={() => setIsVerseSelectorOpen(true)}
                  className={`p-2 rounded-full hover:bg-stone-200/50 transition-colors ${isDarkMode ? 'hover:bg-stone-800' : ''}`}
                  id="verse-selector-trigger"
                >
                  <ListOrdered size={24} />
                </button>
              </div>
            ) : (
              <div className="p-2 bg-emerald-600 rounded-lg text-white">
                <BookOpen size={24} />
              </div>
            )}
            <div className="overflow-hidden">
              <h1 className="font-bold text-lg leading-tight truncate">
                {selectedSurah && surahDetail ? surahDetail.name : 'Al-Quran Digital'}
              </h1>
              <p className="text-xs opacity-60 truncate">
                {selectedSurah && surahDetail ? `${surahDetail.number}. ${surahDetail.englishName}` : 'Baca & Tadabbur'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsTajweedEnabled(!isTajweedEnabled)}
              className={`p-2 rounded-xl transition-all flex flex-col items-center gap-0.5 min-w-[60px] ${
                isTajweedEnabled 
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                  : 'bg-stone-500/10 text-stone-400 border border-transparent opacity-60'
              }`}
              id="tajweed-toggle"
              title="Toggle Tajweed Colors"
              disabled={tajweedLoading}
            >
              <div className="text-[9px] font-black uppercase tracking-tighter">
                {tajweedLoading ? 'Loading' : 'Tajweed'}
              </div>
              <div className={`w-6 h-1 rounded-full ${isTajweedEnabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-stone-400'} ${tajweedLoading ? 'animate-pulse' : ''}`}></div>
            </button>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-full hover:bg-stone-200/50 transition-colors ${isDarkMode ? 'hover:bg-stone-800' : ''}`}
              id="theme-toggle"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {selectedSurah && (
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setFontSize(prev => Math.max(24, prev - 4))}
                  className={`p-2 rounded-full hover:bg-stone-200/50 transition-colors ${isDarkMode ? 'hover:bg-stone-800' : ''}`}
                  id="font-decrease"
                >
                  <span className="text-xs font-bold">A-</span>
                </button>
                <button 
                  onClick={() => setFontSize(prev => Math.min(64, prev + 4))}
                  className={`p-2 rounded-full hover:bg-stone-200/50 transition-colors ${isDarkMode ? 'hover:bg-stone-800' : ''}`}
                  id="font-increase"
                >
                  <span className="text-sm font-bold">A+</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {!selectedSurah ? (
            currentTab === 'quran' ? (
              <motion.div
                key="list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Search Bar */}
                <div className={`relative group ${isDarkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-emerald-600 transition-colors" size={18} />
                  <input 
                    type="text"
                    placeholder="Cari Surah (contoh: Al-Fatihah, 1)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-10 pr-4 py-3 rounded-2xl border outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
                      isDarkMode ? 'bg-stone-900 border-stone-800 focus:bg-stone-800' : 'bg-white border-stone-200 focus:bg-white'
                    }`}
                    id="surah-search"
                  />
                </div>

                {/* Surah List */}
                <div className="grid gap-3">
                  {filteredSurahs.map((surah) => (
                    <button
                      key={surah.number}
                      onClick={() => setSelectedSurah(surah.number)}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all hover:scale-[1.01] active:scale-[0.99] text-left group ${
                        isDarkMode 
                          ? 'bg-stone-900 border-stone-800 hover:border-emerald-500/50 hover:bg-stone-800' 
                          : 'bg-white border-stone-200 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5'
                      }`}
                      id={`surah-item-${surah.number}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-colors ${
                          isDarkMode ? 'bg-stone-800 text-stone-400 group-hover:bg-emerald-900 group-hover:text-emerald-400' : 'bg-stone-100 text-stone-500 group-hover:bg-emerald-50 group-hover:text-emerald-600'
                        }`}>
                          {surah.number}
                        </div>
                        <div>
                          <h3 className="font-bold">{surah.englishName}</h3>
                          <p className="text-xs opacity-50 uppercase tracking-wider font-medium">
                            {surah.revelationType} • {surah.numberOfAyahs} Ayat
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-arabic text-2xl mb-1">{surah.name}</div>
                        <p className="text-[10px] opacity-40">{surah.englishNameTranslation}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="bookmarks"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 pb-20"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Ayat Tersimpan</h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${isDarkMode ? 'bg-stone-800 text-stone-400' : 'bg-stone-100 text-stone-500'}`}>
                    {bookmarks.length} Bookmark
                  </span>
                </div>
                
                {bookmarks.length === 0 ? (
                  <div className={`p-16 text-center rounded-3xl border-2 border-dashed ${isDarkMode ? 'border-stone-800' : 'border-stone-200'}`}>
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-stone-900' : 'bg-stone-50'}`}>
                      <BookmarkIcon className="opacity-20" size={32} />
                    </div>
                    <p className="font-medium opacity-50">Belum ada ayat yang disimpan.</p>
                    <button 
                      onClick={() => setCurrentTab('quran')}
                      className="mt-4 text-emerald-600 font-bold hover:underline"
                    >
                      Mulai Membaca →
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {bookmarks.map((bookmark) => (
                      <div 
                        key={`${bookmark.surahNumber}-${bookmark.ayahNumber}`}
                        className={`p-5 rounded-2xl border transition-all group ${
                          isDarkMode ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <button 
                            onClick={() => goToBookmark(bookmark)}
                            className="text-left"
                          >
                            <h3 className="font-bold group-hover:text-emerald-600 transition-colors">
                              {bookmark.surahName}
                            </h3>
                            <p className="text-xs opacity-50 font-medium">Ayat {bookmark.ayahNumber}</p>
                          </button>
                          <button 
                            onClick={() => removeBookmark(bookmark.surahNumber, bookmark.ayahNumber)}
                            className="p-2 text-stone-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50"
                            title="Hapus Bookmark"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        <p className="font-arabic text-2xl text-right mb-4 leading-relaxed" dir="rtl">
                          {bookmark.ayahText}
                        </p>
                        <button 
                          onClick={() => goToBookmark(bookmark)}
                          className="w-full py-2 rounded-xl bg-emerald-600/10 text-emerald-600 text-xs font-bold hover:bg-emerald-600 hover:text-white transition-all"
                        >
                          Buka Ayat →
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )
          ) : (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`space-y-8 pb-20 ${isTajweedEnabled ? 'tajweed-active' : ''}`}
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                  <p className="text-sm opacity-50 font-medium">Memuat Ayat...</p>
                </div>
              ) : (
                <>
                  {/* Bismillah if not Al-Fatihah or At-Tawbah */}
                  {surahDetail && surahDetail.number !== 1 && surahDetail.number !== 9 && (
                    <div className="text-center py-8">
                      <div className="font-arabic text-4xl mb-2">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
                    </div>
                  )}

                  {tajweedLoading && (
                    <div className="flex items-center justify-center p-4 text-emerald-600 bg-emerald-50/50 rounded-xl animate-pulse">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      <span className="text-sm font-medium">Menerapkan Hukum Tajwid...</span>
                    </div>
                  )}

                  {surahDetail?.ayahs.map((ayah, index) => {
                    const bismillahRegex = /^بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ\s*/;
                    
                    // Remove Bismillah from the first ayah if it's not Al-Fatihah
                    let arabicText = ayah.text;
                    if (surahDetail.number !== 1 && index === 0) {
                      arabicText = arabicText.replace(bismillahRegex, '').trim();
                    }

                    const tajweedTextRaw = tajweedAyahs[ayah.numberInSurah];
                    let tajweedText = tajweedTextRaw;
                    if (surahDetail.number !== 1 && index === 0 && tajweedText) {
                      tajweedText = tajweedText.replace(bismillahRegex, '').trim();
                    }
                    const displayTajweed = isTajweedEnabled && tajweedText;

                    return (
                      <div 
                        key={ayah.number} 
                        className={`space-y-6 pb-8 border-b ${isDarkMode ? 'border-stone-800' : 'border-stone-200'}`}
                        id={`ayah-${ayah.numberInSurah}`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className={`text-xs font-bold px-2 py-1 rounded border ${isDarkMode ? 'bg-stone-900 border-stone-800 text-stone-500' : 'bg-stone-100 border-stone-200 text-stone-400'}`}>
                            {ayah.numberInSurah}
                          </div>
                          <button 
                            onClick={() => surahDetail && toggleBookmark(ayah, surahDetail)}
                            className={`p-2 rounded-full transition-colors ${
                              bookmarks.some(b => b.surahNumber === surahDetail?.number && b.ayahNumber === ayah.numberInSurah)
                                ? 'text-emerald-600 bg-emerald-50'
                                : 'text-stone-400 hover:bg-stone-100'
                            }`}
                            id={`bookmark-${ayah.numberInSurah}`}
                          >
                            <BookmarkIcon size={18} fill={bookmarks.some(b => b.surahNumber === surahDetail?.number && b.ayahNumber === ayah.numberInSurah) ? "currentColor" : "none"} />
                          </button>
                        </div>

                        {displayTajweed ? (
                          <div 
                            className="arabic-text text-right"
                            style={{ fontSize: `${fontSize}px` }}
                            dangerouslySetInnerHTML={{ __html: (tajweedText || arabicText) + `<span class="inline-flex items-center justify-center w-10 h-10 mx-2 text-sm border-2 border-stone-300 rounded-full font-sans translate-y-[-4px]">${ayah.numberInSurah}</span>` }}
                          />
                        ) : (
                          <div 
                            className="arabic-text text-right"
                            style={{ fontSize: `${fontSize}px` }}
                          >
                            {arabicText}
                            <span className="inline-flex items-center justify-center w-10 h-10 mx-2 text-sm border-2 border-stone-300 rounded-full font-sans translate-y-[-4px]">
                              {ayah.numberInSurah}
                            </span>
                          </div>
                        )}

                        <div className={`text-lg leading-relaxed ${isDarkMode ? 'text-stone-300' : 'text-stone-600'}`}>
                          <span className="font-bold mr-2 text-emerald-600">{ayah.numberInSurah}.</span>
                          {translation[index]?.text}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Verse Selector Modal */}
      <AnimatePresence>
        {isVerseSelectorOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsVerseSelectorOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] ${isDarkMode ? 'bg-stone-900 text-stone-100' : 'bg-white text-stone-900'}`}
            >
              <div className="p-6 border-b border-stone-200/10 flex items-center justify-between">
                <h2 className="text-xl font-bold">Select verse</h2>
                <button 
                  onClick={() => setIsVerseSelectorOpen(false)}
                  className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4">
                <div className={`relative group ${isDarkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-emerald-600 transition-colors" size={18} />
                  <input 
                    type="text"
                    placeholder="Search verse number..."
                    value={verseSearchQuery}
                    onChange={(e) => setVerseSearchQuery(e.target.value)}
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
                      isDarkMode ? 'bg-stone-800 border-stone-700' : 'bg-stone-50 border-stone-200'
                    }`}
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-5 gap-2">
                  {filteredVerses.map((verse) => (
                    <button
                      key={verse}
                      onClick={() => scrollToVerse(verse)}
                      className={`aspect-square flex items-center justify-center rounded-xl font-bold text-lg transition-all hover:scale-110 active:scale-95 ${
                        isDarkMode 
                          ? 'bg-stone-800 hover:bg-emerald-600 hover:text-white' 
                          : 'bg-stone-100 hover:bg-emerald-600 hover:text-white'
                      }`}
                    >
                      {verse}
                    </button>
                  ))}
                  {filteredVerses.length === 0 && (
                    <div className="col-span-5 py-8 text-center opacity-50 text-sm italic">
                      No verse found
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className={`fixed bottom-20 left-1/2 z-[100] px-6 py-3 rounded-full shadow-lg text-white text-sm font-bold flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-600' : 'bg-stone-800'
            }`}
          >
            {toast.type === 'success' ? <BookmarkIcon size={16} fill="currentColor" /> : <Trash2 size={16} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer / Navigation */}
      {!selectedSurah && (
        <footer className={`fixed bottom-0 left-0 right-0 border-t backdrop-blur-md ${isDarkMode ? 'bg-stone-900/80 border-stone-800' : 'bg-white/80 border-stone-200'}`}>
          <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-around">
            <button 
              onClick={() => setCurrentTab('quran')}
              className={`flex flex-col items-center gap-1 transition-all ${currentTab === 'quran' ? 'text-emerald-600' : 'opacity-40 hover:opacity-100'}`}
              id="tab-quran"
            >
              <BookOpen size={20} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Quran</span>
            </button>
            <button 
              onClick={() => setCurrentTab('bookmarks')}
              className={`flex flex-col items-center gap-1 transition-all ${currentTab === 'bookmarks' ? 'text-emerald-600' : 'opacity-40 hover:opacity-100'}`}
              id="tab-bookmarks"
            >
              <BookmarkIcon size={20} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Saved</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
