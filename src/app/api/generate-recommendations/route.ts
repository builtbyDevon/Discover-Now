import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loadRecommendedSongs, addRecommendedSong, isSongRecommended, isArtistBlacklisted, loadBlacklistedArtists } from '@/lib/songDatabase';

export async function POST() {
    try {
        const cookieStore = await cookies();
        const accessToken = cookieStore.get('spotify_access_token')?.value;

        if (!accessToken) {
            return NextResponse.json({ error: 'No access token' }, { status: 401 });
        }

        // ============================================
        // STEP 1: GET TOTAL NUMBER OF USER'S SAVED TRACKS
        // ============================================
        const initialResponse = await fetch(`https://api.spotify.com/v1/me/tracks?limit=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const initialData = await initialResponse.json();
        const totalTracks = initialData.total;

        console.log(`User has ${totalTracks} total saved tracks`);

        // ============================================
        // STEP 2: GENERATE RANDOM POSITIONS TO SAMPLE FROM USER'S LIBRARY
        // ============================================
        const randomOffsets = [];
        const itemsToGet = Math.min(50, totalTracks);

        for (let i = 0; i < itemsToGet; i++) {
            const randomOffset = Math.floor(Math.random() * totalTracks);
            randomOffsets.push(randomOffset);
        }

        // ============================================
        // STEP 3: FETCH RANDOM TRACKS FROM USER'S LIBRARY
        // ============================================
        const acquiredDataContainer: any[] = [];

        for (const offset of randomOffsets) {
            const response = await fetch(`https://api.spotify.com/v1/me/tracks?limit=1&offset=${offset}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                acquiredDataContainer.push({
                    name: data.items[0].track.name, 
                    artists: data.items[0].track.artists.map((artist: any) => artist.name)
                });
            }
        }

        console.log(`Got ${acquiredDataContainer.length} random tracks from ${totalTracks} total`);

        // ============================================
        // STEP 4: BUILD COMPLETE LIST OF USER'S ARTISTS (FOR FILTERING)
        // ============================================
        const userArtists = new Set();
        let offset = 0;
        const limit = 50;

        while (offset < totalTracks) {
            const allTracksResponse = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            const allTracksData = await allTracksResponse.json();
            
            if (allTracksData.items) {
                for (const item of allTracksData.items) {
                    for (const artist of item.track.artists) {
                        userArtists.add(artist.name.toLowerCase());
                    }
                }
            }
            
            offset += limit;
        }

        console.log(`User has ${userArtists.size} unique artists in their ENTIRE library`);

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
                        const artistLower = artistName.toLowerCase();
                        
                        if (!userArtists.has(artistLower) && !uniqueArtists.has(artistLower) && !isArtistBlacklisted(artistName)) {
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
        const targetTrackCount = 10;
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
                const searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                const searchData = await searchResponse.json();
                
                if (searchData.artists?.items?.[0]) {
                    const artist = searchData.artists.items[0];
                    
                    const tracksResponse = await fetch(`https://api.spotify.com/v1/artists/${artist.id}/top-tracks?market=US`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
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
                            const trackData = {
                                artist: artistName,
                                name: selectedTrack.name,
                                preview_url: selectedTrack.preview_url,
                                external_urls: selectedTrack.external_urls.spotify,
                                uri: selectedTrack.uri
                            };
                            
                            foundTracks.push(trackData);
                            
                            addRecommendedSong({
                                uri: selectedTrack.uri,
                                name: selectedTrack.name,
                                artist: artistName,
                                dateAdded: new Date().toISOString()
                            });
                            
                            console.log(`✅ Added track ${foundTracks.length}/${targetTrackCount}: ${selectedTrack.name} by ${artistName}`);
                        } else {
                            console.log(`❌ Skipping ${artistName} - all their top tracks already recommended`);
                        }
                    } else {
                        console.log(`❌ Skipping ${artistName} - no tracks found`);
                    }
                } else {
                    console.log(`❌ Skipping ${artistName} - artist not found on Spotify`);
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
                const userResponse = await fetch('https://api.spotify.com/v1/me', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const userData = await userResponse.json();
                
                const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${userData.id}/playlists`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
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
                    await fetch(`https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
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