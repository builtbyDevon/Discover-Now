import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loadRecommendedSongs, addRecommendedSong, isSongRecommended, isArtistBlacklisted, loadBlacklistedArtists } from '@/lib/songDatabase';

// Helper function to check if token needs refresh and get a valid access token
async function getValidAccessToken(): Promise<{ token: string; refreshed: boolean } | null> {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('spotify_access_token')?.value;
    const refreshToken = cookieStore.get('spotify_refresh_token')?.value;
    const expiresAtStr = cookieStore.get('spotify_token_expires_at')?.value;

    if (!accessToken) {
        return null;
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = parseInt(expiresAtStr || '0');
    const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
    
    if (expiresAt > fiveMinutesFromNow) {
        // Token is still valid
        return { token: accessToken, refreshed: false };
    }

    // Token is expired or about to expire, try to refresh
    if (!refreshToken) {
        return null; // No refresh token available
    }

    try {
        const response = await fetch('http://127.0.0.1:3000/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Cookie': `spotify_refresh_token=${refreshToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            return { token: data.access_token, refreshed: true };
        }
    } catch (error) {
        console.error('Error refreshing token:', error);
    }

    return null; // Refresh failed
}

// Helper function to make authenticated Spotify API requests with auto-refresh
async function makeSpotifyRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const tokenInfo = await getValidAccessToken();
    
    if (!tokenInfo) {
        throw new Error('No valid access token available');
    }

    const headers = {
        'Authorization': `Bearer ${tokenInfo.token}`,
        ...options.headers
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    // If we get a 401 and haven't already refreshed, try once more with refresh
    if (response.status === 401 && !tokenInfo.refreshed) {
        const newTokenInfo = await getValidAccessToken();
        if (newTokenInfo && newTokenInfo.refreshed) {
            const retryHeaders = {
                'Authorization': `Bearer ${newTokenInfo.token}`,
                ...options.headers
            };
            
            return fetch(url, {
                ...options,
                headers: retryHeaders
            });
        }
    }

    return response;
}

// Simple string similarity function (Levenshtein distance based)
function getSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;
    
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
    
    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j - 1][i] + 1,     // deletion
                matrix[j][i - 1] + 1,     // insertion
                matrix[j - 1][i - 1] + cost // substitution
            );
        }
    }
    
    const maxLen = Math.max(len1, len2);
    return (maxLen - matrix[len2][len1]) / maxLen;
}

function extractPlaylistId(url: string): string | null {
    if (!url) return null;
    
    // Handle different Spotify URL formats:
    // https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd
    // https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd?si=...
    // spotify:playlist:37i9dQZF1DX0XUsuxWHRQd
    
    const playlistMatch = url.match(/(?:playlist[\/:])([\w]+)/);
    return playlistMatch ? playlistMatch[1] : null;
}

export async function POST(request: NextRequest) {
    try {
        // Check if we have a valid access token (with auto-refresh if needed)
        const tokenInfo = await getValidAccessToken();
        if (!tokenInfo) {
            return NextResponse.json({ error: 'No access token' }, { status: 401 });
        }

        // Parse request body to get optional playlist URL
        let body;
        try {
            body = await request.json();
        } catch {
            body = {};
        }
        
        const sourcePlaylistUrl = body.playlistUrl;
        const samplingStrategy = body.samplingStrategy || 'recent'; // Default to recent sampling
        const playlistId = extractPlaylistId(sourcePlaylistUrl);
        const usePlaylist = playlistId !== null;
        
        console.log(usePlaylist ? `Using playlist: ${playlistId}` : `Using liked songs with ${samplingStrategy} sampling strategy`);

        // ============================================
        // STEP 1: GET TOTAL NUMBER OF TRACKS (PLAYLIST OR LIKES)
        // ============================================
        console.log('Making initial request to Spotify API...');
        
        let tracksEndpoint: string;
        if (usePlaylist) {
            tracksEndpoint = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=1`;
        } else {
            tracksEndpoint = `https://api.spotify.com/v1/me/tracks?limit=1`;
        }
        
        const initialResponse = await makeSpotifyRequest(tracksEndpoint);
        const initialData = await initialResponse.json();
        const totalTracks = initialData.total;

        console.log(`${usePlaylist ? 'Playlist' : 'User'} has ${totalTracks} total tracks`);

        // ============================================
        // STEP 2: GENERATE SAMPLING POSITIONS BASED ON STRATEGY
        // ============================================
        const randomOffsets = [];
        const itemsToGet = Math.min(50, totalTracks);
        
        // Define recent range (top 30% of tracks = most recently added)
        const recentRangeSize = Math.floor(totalTracks * 0.3);
        
        if (usePlaylist || samplingStrategy === 'all-random') {
            // For playlists or all-random strategy: sample randomly from entire collection
            console.log(`Sampling strategy: ${itemsToGet} tracks randomly from entire library (0-${totalTracks})`);
            for (let i = 0; i < itemsToGet; i++) {
                const randomOffset = Math.floor(Math.random() * totalTracks);
                randomOffsets.push(randomOffset);
            }
        } else if (samplingStrategy === 'super-recent') {
            // Super recent strategy: sample only from the first ~70 tracks (most recent)
            const superRecentRange = Math.min(70, totalTracks);
            console.log(`Sampling strategy: ${itemsToGet} tracks from super recent library (0-${superRecentRange})`);
            for (let i = 0; i < itemsToGet; i++) {
                const randomOffset = Math.floor(Math.random() * superRecentRange);
                randomOffsets.push(randomOffset);
            }
        } else if (samplingStrategy === 'recent') {
            // Recent strategy: sample only from recent tracks (last 6 months / top 30%)
            console.log(`Sampling strategy: ${itemsToGet} tracks from recent library (0-${recentRangeSize})`);
            for (let i = 0; i < itemsToGet; i++) {
                const randomOffset = Math.floor(Math.random() * recentRangeSize);
                randomOffsets.push(randomOffset);
            }
        } else if (samplingStrategy === 'half-and-half') {
            // Half and half: 50% recent, 50% from older tracks
            const recentCount = Math.floor(itemsToGet * 0.5);
            const olderCount = itemsToGet - recentCount;
            const olderRangeStart = recentRangeSize;
            const olderRangeSize = totalTracks - recentRangeSize;
            
            console.log(`Sampling strategy: ${recentCount} from recent (0-${recentRangeSize}), ${olderCount} from older tracks (${olderRangeStart}-${totalTracks})`);
            
            // Get half from recent tracks
            for (let i = 0; i < recentCount; i++) {
                const randomOffset = Math.floor(Math.random() * recentRangeSize);
                randomOffsets.push(randomOffset);
            }
            
            // Get half from older tracks
            for (let i = 0; i < olderCount; i++) {
                const randomOffset = olderRangeStart + Math.floor(Math.random() * olderRangeSize);
                randomOffsets.push(randomOffset);
            }
        }

        // ============================================
        // STEP 3: FETCH RANDOM TRACKS FROM SOURCE
        // ============================================
        const acquiredDataContainer: any[] = [];

        for (const offset of randomOffsets) {
            let trackEndpoint: string;
            if (usePlaylist) {
                trackEndpoint = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=1&offset=${offset}`;
            } else {
                trackEndpoint = `https://api.spotify.com/v1/me/tracks?limit=1&offset=${offset}`;
            }
            
            const response = await makeSpotifyRequest(trackEndpoint);
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                const track = data.items[0].track;
                acquiredDataContainer.push({
                    name: track.name, 
                    artists: track.artists.map((artist: any) => artist.name)
                });
            }
        }

        // Log actual sampling range for clarity
        let samplingRangeMessage = '';
        if (usePlaylist) {
            samplingRangeMessage = `entire playlist (${totalTracks} tracks)`;
        } else if (samplingStrategy === 'super-recent') {
            const superRecentRange = Math.min(70, totalTracks);
            samplingRangeMessage = `super recent range (${superRecentRange} tracks)`;
        } else if (samplingStrategy === 'recent') {
            const recentRangeSize = Math.floor(totalTracks * 0.3);
            samplingRangeMessage = `recent range (${recentRangeSize} tracks)`;
        } else if (samplingStrategy === 'half-and-half') {
            const recentRangeSize = Math.floor(totalTracks * 0.3);
            const olderRangeSize = totalTracks - recentRangeSize;
            samplingRangeMessage = `half recent (${recentRangeSize}) + half older (${olderRangeSize})`;
        } else {
            samplingRangeMessage = `entire library (${totalTracks} tracks)`;
        }
        console.log(`Got ${acquiredDataContainer.length} random tracks from ${samplingRangeMessage}`);

        // ============================================
        // STEP 4: BUILD COMPLETE LIST OF USER'S ARTISTS (FOR FILTERING)
        // ============================================
        const userArtists = new Set();
        
        // Always get user's library for filtering, even when using a playlist
        const userTracksResponse = await makeSpotifyRequest(`https://api.spotify.com/v1/me/tracks?limit=1`);
        const userTracksData = await userTracksResponse.json();
        const userTotalTracks = userTracksData.total;
        
        let offset = 0;
        const limit = 50;

        while (offset < userTotalTracks) {
            const allTracksResponse = await makeSpotifyRequest(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`);
            
            const allTracksData = await allTracksResponse.json();
            
            if (allTracksData.items) {
                for (const item of allTracksData.items) {
                    for (const artist of item.track.artists) {
                        // Add original name and cleaned version for better matching
                        const cleanName = artist.name.toLowerCase().trim();
                        userArtists.add(cleanName);
                        
                        // Also add version without "feat.", "ft.", "&" etc for better matching
                        const baseArtistName = cleanName
                            .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
                            .replace(/\s*&\s+.*$/i, '')
                            .replace(/\s*,\s+.*$/i, '')
                            .trim();
                        if (baseArtistName && baseArtistName !== cleanName) {
                            userArtists.add(baseArtistName);
                        }
                    }
                }
            }
            
            offset += limit;
        }

        console.log(`User has ${userArtists.size} unique artists in their library (for filtering)`);

        // ============================================
        // STEP 5: GET SIMILAR ARTISTS FROM LAST.FM
        // ============================================
        let similarArtists: string[] = [];
        const targetArtists = 50; // Get more artists to ensure we can find 10 songs
        const uniqueArtists = new Set();

        for (const track of acquiredDataContainer) {
            for (const artist of track.artists) {
                if (uniqueArtists.size >= targetArtists) break;
                
                const res = await fetch(
                    `http://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artist)}&api_key=232c010f595b51b02591fbf00ec00d44&format=json`
                );
                const data = await res.json();
                
                if (data.similarartists?.artist) {
                    for (const similarArtist of data.similarartists.artist) {
                        const artistName = similarArtist.name;
                        const artistLower = artistName.toLowerCase().trim();
                        
                        // Also check base artist name (without feat/ft/&)
                        const baseArtistName = artistLower
                            .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, '')
                            .replace(/\s*&\s+.*$/i, '')
                            .replace(/\s*,\s+.*$/i, '')
                            .trim();
                        
                        const isArtistInLibrary = userArtists.has(artistLower) || userArtists.has(baseArtistName);
                        
                        if (!isArtistInLibrary && !uniqueArtists.has(artistLower) && !isArtistBlacklisted(artistName)) {
                            console.log(`✅ Adding similar artist: ${artistName} (not in your ${userArtists.size} library artists)`);
                        } else if (isArtistInLibrary) {
                            console.log(`❌ Skipping ${artistName} - already in your library`);
                        }
                        
                        if (!isArtistInLibrary && !uniqueArtists.has(artistLower) && !isArtistBlacklisted(artistName)) {
                            uniqueArtists.add(artistLower);
                            similarArtists.push(artistName);
                            
                            if (uniqueArtists.size >= targetArtists) break;
                        }
                    }
                }
            }
            if (uniqueArtists.size >= targetArtists) break;
        }

        console.log(`Found ${uniqueArtists.size} unique new artists to search through`);

        // ============================================
        // STEP 6: SEARCH FOR ARTISTS ON SPOTIFY AND GET THEIR TOP TRACKS
        // ============================================
        const foundTracks: any[] = [];
        const targetTrackCount = 20;
        let artistIndex = 0;
        let attemptsCount = 0;
        const maxAttempts = 100; // Prevent infinite loops
        
        console.log(`Starting search for ${targetTrackCount} tracks from ${similarArtists.length} similar artists`);
        
        while (foundTracks.length < targetTrackCount && artistIndex < similarArtists.length && attemptsCount < maxAttempts) {
            const artistName = similarArtists[artistIndex];
            artistIndex++;
            attemptsCount++;
            
            console.log(`Attempt ${attemptsCount}: Checking ${artistName} (${foundTracks.length}/${targetTrackCount} tracks found)`);
            
            try {
                // Search for multiple artists to find the best match
                const searchResponse = await makeSpotifyRequest(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=3`);
                
                const searchData = await searchResponse.json();
                
                if (searchData.artists?.items?.length > 0) {
                    // Find the best matching artist by name similarity
                    let bestMatch = null;
                    let bestMatchScore = 0;
                    
                    const searchArtistLower = artistName.toLowerCase().trim();
                    
                    for (const spotifyArtist of searchData.artists.items) {
                        const spotifyArtistLower = spotifyArtist.name.toLowerCase().trim();
                        
                        // Calculate similarity score
                        let score = 0;
                        if (spotifyArtistLower === searchArtistLower) {
                            score = 100; // Exact match
                        } else if (spotifyArtistLower.includes(searchArtistLower) || searchArtistLower.includes(spotifyArtistLower)) {
                            score = 80; // Partial match
                        } else {
                            // Check if they're similar enough (basic similarity)
                            const similarity = getSimilarity(searchArtistLower, spotifyArtistLower);
                            score = similarity * 100;
                        }
                        
                        if (score > bestMatchScore && score >= 70) { // Require at least 70% similarity
                            bestMatch = spotifyArtist;
                            bestMatchScore = score;
                        }
                    }
                    
                    if (bestMatch) {
                        console.log(`🎯 Best artist match: "${bestMatch.name}" (${bestMatchScore.toFixed(1)}% similarity to "${artistName}")`);
                        
                        const tracksResponse = await makeSpotifyRequest(`https://api.spotify.com/v1/artists/${bestMatch.id}/top-tracks?market=US`);
                        
                        const tracksData = await tracksResponse.json();
                        
                        if (tracksData.tracks && tracksData.tracks.length > 0) {
                            let selectedTrack = null;
                            
                            for (let i = 0; i < Math.min(5, tracksData.tracks.length); i++) {
                                const track = tracksData.tracks[i];
                                if (!isSongRecommended(track.uri)) {
                                    selectedTrack = track;
                                    break;
                                }
                            }
                            
                            if (selectedTrack) {
                                // Use the actual Spotify artist name, not the Last.fm one
                                const actualArtistName = selectedTrack.artists[0].name;
                                
                                const trackData = {
                                    artist: actualArtistName, // Use actual Spotify artist name
                                    name: selectedTrack.name,
                                    preview_url: selectedTrack.preview_url,
                                    external_urls: selectedTrack.external_urls.spotify,
                                    uri: selectedTrack.uri
                                };
                                
                                foundTracks.push(trackData);
                                
                                addRecommendedSong({
                                    uri: selectedTrack.uri,
                                    name: selectedTrack.name,
                                    artist: actualArtistName, // Use actual Spotify artist name
                                    dateAdded: new Date().toISOString()
                                });
                                
                                console.log(`✅ Added track ${foundTracks.length}/${targetTrackCount}: "${selectedTrack.name}" by "${actualArtistName}" (searched for "${artistName}")`);
                            } else {
                                console.log(`❌ Skipping ${bestMatch.name} - all their top tracks already recommended`);
                            }
                        } else {
                            console.log(`❌ Skipping ${bestMatch.name} - no tracks found`);
                        }
                    } else {
                        console.log(`❌ Skipping "${artistName}" - no good artist match found on Spotify (best was ${bestMatchScore.toFixed(1)}%)`);
                    }
                } else {
                    console.log(`❌ Skipping "${artistName}" - no artists found on Spotify`);
                }
            } catch (error) {
                console.log(`❌ Error searching for ${artistName}:`, error);
            }
            
            // If we've gone through all artists but still need more tracks, 
            // we might need to get more similar artists
            if (artistIndex >= similarArtists.length && foundTracks.length < targetTrackCount) {
                console.log(`Reached end of artist list with only ${foundTracks.length} tracks. Stopping search.`);
                break;
            }
        }

        console.log(`🎵 Final result: Found ${foundTracks.length} tracks after ${attemptsCount} attempts`);

        // ============================================
        // STEP 7: CREATE SPOTIFY PLAYLIST
        // ============================================
        let playlistUrl = null;

        if (foundTracks.length > 0) {
            try {
                const userResponse = await makeSpotifyRequest('https://api.spotify.com/v1/me');
                const userData = await userResponse.json();
                
                const playlistResponse = await makeSpotifyRequest(`https://api.spotify.com/v1/users/${userData.id}/playlists`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: `Discover NOW ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                        description: 'Generated playlist from similar artists',
                        public: false
                    })
                });
                
                const playlistData = await playlistResponse.json();

                if (playlistData.external_urls?.spotify) {
                    playlistUrl = playlistData.external_urls.spotify;
                } else {
                    playlistUrl = `https://open.spotify.com/playlist/${playlistData.id}`;
                }
                
                const trackUris = foundTracks.map(track => track.uri).filter(Boolean);
                
                if (trackUris.length > 0) {
                    await makeSpotifyRequest(`https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ uris: trackUris })
                    });
                }
                
                console.log('Playlist created with', trackUris.length, 'tracks');
                
            } catch (error) {
                console.error('Error creating playlist:', error);
            }
        }

        return NextResponse.json({
            success: true,
            tracks: foundTracks,
            playlistUrl,
            totalTracks,
            message: 'Recommendations generated successfully'
        });

    } catch (error) {
        console.error('Error generating recommendations:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 