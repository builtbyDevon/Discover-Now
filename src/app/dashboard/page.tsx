'use client';
import { useState, useEffect } from 'react';
import BlacklistButton from '@/components/BlacklistButton';

interface Track {
    artist: string;
    name: string;
    preview_url: string;
    external_urls: string;
    uri: string;
}

export default function Dashboard() {
    const [loading, setLoading] = useState(false); // Changed from true to false
    const [tracks, setTracks] = useState<Track[]>([]);
    const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [inputPlaylistUrl, setInputPlaylistUrl] = useState<string>('');
    const [hasGenerated, setHasGenerated] = useState(false); // New state to track if we've generated anything
    const [samplingStrategy, setSamplingStrategy] = useState<string>('recent'); // New state for sampling strategy
    const [userTrackCount, setUserTrackCount] = useState<number>(0); // Track user's total library size
    const [isCheckingLibrary, setIsCheckingLibrary] = useState(false); // Loading state for library check

    // Check user's library size when component mounts (only if not using a playlist)
    useEffect(() => {
        if (!inputPlaylistUrl) {
            checkUserLibrarySize();
        }
    }, [inputPlaylistUrl]);

    const checkUserLibrarySize = async () => {
        setIsCheckingLibrary(true);
        try {
            const response = await fetch('/api/user-library-size');
            if (response.ok) {
                const data = await response.json();
                setUserTrackCount(data.totalTracks || 0);
            }
        } catch (error) {
            console.error('Error checking library size:', error);
        } finally {
            setIsCheckingLibrary(false);
        }
    };

    // Removed the useEffect that automatically called generateRecommendations()

    const generateRecommendations = async (sourcePlaylistUrl?: string) => {
        setLoading(true);
        setError(null);
        setHasGenerated(true);
        
        try {
            const response = await fetch('/api/generate-recommendations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    playlistUrl: sourcePlaylistUrl || inputPlaylistUrl || null,
                    samplingStrategy: samplingStrategy
                }),
            });
            
            const data = await response.json();
            
            if (data.success) {
                setTracks(data.tracks);
                setPlaylistUrl(data.playlistUrl);
            } else {
                setError(data.error || 'Failed to generate recommendations');
            }
        } catch (err) {
            setError('Error generating recommendations');
            console.error('Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateClick = () => {
        generateRecommendations();
    };

    const getSamplingDescription = (strategy: string) => {
        switch (strategy) {
            case 'super-recent': return 'latest additions';
            case 'recent': return 'recent';
            case 'half-and-half': return 'recent & older';
            case 'all-random': return 'full';
            default: return 'recent';
        }
    };

    // Show welcome screen if we haven't generated anything yet
    if (!hasGenerated && !loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <div className="text-center max-w-2xl mx-auto p-8">
                    <h1 className="text-4xl font-bold text-white mb-6">🎵 Welcome to Music Discovery</h1>
                    <p className="text-gray-300 text-lg mb-8">
                        Discover amazing new music based on your taste! We'll analyze your music library and find similar artists to create a personalized playlist for you.
                    </p>
                    
                    <div className="max-w-md mx-auto mb-8 space-y-4">
                        <div>
                            <label htmlFor="playlist-url" className="block text-sm font-medium text-gray-300 mb-2">
                                Optional: Paste Spotify Playlist URL
                            </label>
                            <input
                                id="playlist-url"
                                type="text"
                                value={inputPlaylistUrl}
                                onChange={(e) => setInputPlaylistUrl(e.target.value)}
                                placeholder="https://open.spotify.com/playlist/..."
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Leave empty to use your liked songs
                            </p>
                        </div>
                        
                        {!inputPlaylistUrl && (
                            <div>
                                <label htmlFor="sampling-strategy" className="block text-sm font-medium text-gray-300 mb-2">
                                    Library Sampling Strategy
                                </label>
                                {isCheckingLibrary ? (
                                    <div className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-400">
                                        Checking library size...
                                    </div>
                                ) : (
                                    <select
                                        id="sampling-strategy"
                                        value={samplingStrategy}
                                        onChange={(e) => setSamplingStrategy(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                                    >
                                        {userTrackCount >= 70 && (
                                            <option value="super-recent">⚡ Super Recent (~70 latest songs)</option>
                                        )}
                                        <option value="recent">Recent Library (Last 6 months) 🕐</option>
                                        <option value="half-and-half">Half Recent & Half Older 🔄</option>
                                        <option value="all-random">All Library Random 🎲</option>
                                    </select>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                    {isCheckingLibrary ? 'Loading options...' : `Choose how we sample from your ${userTrackCount} songs`}
                                </p>
                            </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={handleGenerateClick}
                        className="px-8 py-4 bg-green-500 text-white text-lg font-semibold rounded-lg hover:bg-green-600 transition-colors"
                    >
                        🎵 Generate My Playlist
                    </button>
                    
                    <div className="mt-8 text-gray-400">
                        <p className="text-sm">This process will:</p>
                        <ul className="text-sm space-y-1 mt-2">
                            <li>📚 Analyze your {getSamplingDescription(samplingStrategy)} music library</li>
                            <li>🔍 Find similar artists on Last.fm</li>
                            <li>🎵 Search Spotify for recommendations</li>
                            <li>📝 Create your personalized playlist</li>
                        </ul>
                        <p className="text-xs mt-4">Usually takes 30-60 seconds</p>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-500 mx-auto mb-4"></div>
                    <h2 className="text-2xl font-bold text-white mb-2">Discovering Amazing Music...</h2>
                    <p className="text-gray-400 mb-4">Please wait while we:</p>
                    <ul className="text-gray-300 space-y-1">
                        <li>📚 {inputPlaylistUrl ? 'Analyze your playlist' : `Analyze your ${getSamplingDescription(samplingStrategy)} music library`}</li>
                        <li>🔍 Find similar artists on Last.fm</li>
                        <li>🎵 Search Spotify for recommendations</li>
                        <li>📝 Create your personalized playlist</li>
                    </ul>
                    <p className="text-gray-500 text-sm mt-4">This usually takes 30-60 seconds...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-red-500 mb-4">Oops! Something went wrong</h2>
                    <p className="text-gray-300 mb-4">{error}</p>
                    <button 
                        onClick={handleGenerateClick}
                        className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 bg-gray-900 min-h-screen">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-white mb-4">🎵 Your Music Discoveries</h1>
                    <p className="text-gray-300 mb-6">Fresh recommendations based on your taste!</p>
                    
                    <div className="max-w-md mx-auto mb-6 space-y-4">
                        <div>
                            <label htmlFor="playlist-url" className="block text-sm font-medium text-gray-300 mb-2">
                                Optional: Paste Spotify Playlist URL
                            </label>
                            <input
                                id="playlist-url"
                                type="text"
                                value={inputPlaylistUrl}
                                onChange={(e) => setInputPlaylistUrl(e.target.value)}
                                placeholder="https://open.spotify.com/playlist/..."
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Leave empty to use your liked songs
                            </p>
                        </div>
                        
                        {!inputPlaylistUrl && (
                            <div>
                                <label htmlFor="sampling-strategy" className="block text-sm font-medium text-gray-300 mb-2">
                                    Library Sampling Strategy
                                </label>
                                <select
                                    id="sampling-strategy"
                                    value={samplingStrategy}
                                    onChange={(e) => setSamplingStrategy(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                                >
                                    {userTrackCount >= 70 && (
                                        <option value="super-recent">⚡ Super Recent (~70 latest songs)</option>
                                    )}
                                    <option value="recent">Recent Library (Last 6 months) 🕐</option>
                                    <option value="half-and-half">Half Recent & Half Older 🔄</option>
                                    <option value="all-random">All Library Random 🎲</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    Choose how we sample from your music library
                                </p>
                            </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={handleGenerateClick}
                        className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                        Generate New Recommendations
                    </button>
                </div>

                {playlistUrl && (
                    <div className="mb-8 p-4 bg-green-100 rounded-lg">
                        <h2 className="text-xl font-bold text-green-800 mb-2">🎉 Playlist Created!</h2>
                        <a 
                            href={playlistUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 inline-block"
                        >
                            Open Playlist in Spotify ({tracks.length} songs)
                        </a>
                    </div>
                )}

                <div className="space-y-6">
                    {tracks.map((track, index) => (
                        <div key={index} className="bg-gray-800 rounded-lg p-6 shadow-lg">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-white">{track.name}</h3>
                                    <p className="text-gray-400">by {track.artist}</p>
                                </div>
                                <BlacklistButton artistName={track.artist} />
                            </div>
                            
                            <div className="space-y-3">
                                {track.preview_url && (
                                    <audio controls className="w-full">
                                        <source src={track.preview_url} type="audio/mpeg" />
                                        Your browser does not support the audio element.
                                    </audio>
                                )}
                                
                                <a 
                                    href={track.external_urls} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-block px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                                >
                                    🎧 Open in Spotify
                                </a>
                            </div>
                        </div>
                    ))}
                </div>

                {tracks.length === 0 && !loading && hasGenerated && (
                    <div className="text-center text-gray-400 mt-8">
                        <p>No recommendations found. Try generating new ones!</p>
                    </div>
                )}
            </div>
        </div>
    );
}