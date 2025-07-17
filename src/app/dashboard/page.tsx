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
    const [loading, setLoading] = useState(true);
    const [tracks, setTracks] = useState<Track[]>([]);
    const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        generateRecommendations();
    }, []);

    const generateRecommendations = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const response = await fetch('/api/generate-recommendations', {
                method: 'POST',
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

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-500 mx-auto mb-4"></div>
                    <h2 className="text-2xl font-bold text-white mb-2">Discovering Amazing Music...</h2>
                    <p className="text-gray-400 mb-4">Please wait while we:</p>
                    <ul className="text-gray-300 space-y-1">
                        <li>📚 Analyze your music library</li>
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
                        onClick={generateRecommendations}
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
                    <p className="text-gray-300">Fresh recommendations based on your taste!</p>
                    
                    <button 
                        onClick={generateRecommendations}
                        className="mt-4 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
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

                {tracks.length === 0 && !loading && (
                    <div className="text-center text-gray-400 mt-8">
                        <p>No recommendations found. Try generating new ones!</p>
                    </div>
                )}
            </div>
        </div>
    );
}