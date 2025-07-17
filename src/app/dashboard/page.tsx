import { normalizeFlightData } from 'next/dist/client/flight-data-helpers';
import { cookies } from 'next/headers';

export default async function dashboard() {
    // ============================================
    // STEP 1: GET ACCESS TOKEN
    // ============================================
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('spotify_access_token')?.value;
    const itemsPerRequest = 50;
    const lastFmArtists = [];

    // ============================================
    // STEP 2: GET TOTAL NUMBER OF USER'S SAVED TRACKS
    // ============================================
    // First, get the total number of tracks to know how many the user has
    const initialResponse = await fetch(`https://api.spotify.com/v1/me/tracks?limit=1`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    const initialData = await initialResponse.json();
    const totalTracks = initialData.total;

    console.log(`User has ${totalTracks} total saved tracks`);

    // ============================================
    // STEP 3: GENERATE RANDOM POSITIONS TO SAMPLE FROM USER'S LIBRARY
    // ============================================
    // Generate 50 random positions within the user's total track count
    // This ensures we get a diverse sample instead of just the most recent songs
    const randomOffsets = [];
    const itemsToGet = Math.min(50, totalTracks); // Don't exceed total tracks

    for (let i = 0; i < itemsToGet; i++) {
        const randomOffset = Math.floor(Math.random() * totalTracks);
        randomOffsets.push(randomOffset);
    }

    // ============================================
    // STEP 4: FETCH RANDOM TRACKS FROM USER'S LIBRARY
    // ============================================
    // Get tracks at those random positions to use as "seed" artists
    const acquiredDataContainer = [];

    for (const offset of randomOffsets) {
        const response = await fetch(`https://api.spotify.com/v1/me/tracks?limit=1&offset=${offset}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            // Store track name and all artists from this random track
            acquiredDataContainer.push({
                name: data.items[0].track.name, 
                artists: data.items[0].track.artists.map((artist: any) => artist.name)
            });
        }
    }

    console.log(`Got ${acquiredDataContainer.length} random tracks from ${totalTracks} total`);

    // ============================================
    // STEP 5: BUILD COMPLETE LIST OF USER'S ARTISTS (FOR FILTERING)
    // ============================================
    // Get ALL artists from user's entire library (not just the 50 random)
    // This ensures we don't recommend artists the user already has saved
    const userArtists = new Set();

    // First get total tracks again  
    let offset = 0;
    const limit = 50;

    while (offset < totalTracks) {
        const allTracksResponse = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const allTracksData = await allTracksResponse.json();
        
        if (allTracksData.items) {
            for (const item of allTracksData.items) {
                for (const artist of item.track.artists) {
                    // Store in lowercase for case-insensitive comparison
                    userArtists.add(artist.name.toLowerCase());
                }
            }
        }
        
        offset += limit;
    }

    console.log(`User has ${userArtists.size} unique artists in their ENTIRE library`);

    // ============================================
    // STEP 6: GET SIMILAR ARTISTS FROM LAST.FM
    // ============================================
    // For each artist from our random tracks, find similar artists using Last.fm
    // Keep requesting until we get exactly 10 unique artists the user doesn't already have
    let similarArtists = [];
    const targetArtists = 10;
    const uniqueArtists = new Set();

    for (const track of acquiredDataContainer) {
        for (const artist of track.artists) {
            // Stop if we already have enough unique artists
            if (uniqueArtists.size >= targetArtists) break;
            
            // Call Last.fm API to get similar artists
            const res = await fetch(
                `http://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artist)}&api_key=232c010f595b51b02591fbf00ec00d44&format=json`
            );
            const data = await res.json();
            
            if (data.similarartists?.artist) {
                // Keep trying artists from this response until we get some new ones
                for (const similarArtist of data.similarartists.artist) {
                    const artistName = similarArtist.name;
                    const artistLower = artistName.toLowerCase();
                    
                    // Skip if we already have this artist in our library or already added them
                    if (!userArtists.has(artistLower) && !uniqueArtists.has(artistLower)) {
                        uniqueArtists.add(artistLower);
                        similarArtists.push(artistName);
                        
                        // Stop if we've found enough artists
                        if (uniqueArtists.size >= targetArtists) break;
                    }
                }
            }
        }
        // Break out of outer loop if we have enough artists
        if (uniqueArtists.size >= targetArtists) break;
    }

    console.log(`Found ${uniqueArtists.size} unique new artists`);

    // No need to shuffle since we're already getting exactly what we want
    const randomTenArtists = similarArtists.slice(0, targetArtists);
    
    console.log('Random 10 similar artists:', randomTenArtists);

    // ============================================
    // STEP 7: SEARCH FOR ARTISTS ON SPOTIFY AND GET THEIR TOP TRACKS
    // ============================================
    // For each similar artist, find them on Spotify and get one of their top 3 tracks
    const foundTracks = [];

    for (const artistName of randomTenArtists) {
        try {
            // Search for the artist on Spotify
            const searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            const searchData = await searchResponse.json();
            
            if (searchData.artists?.items?.[0]) {
                const artist = searchData.artists.items[0];
                
                // Get the artist's top tracks
                const tracksResponse = await fetch(`https://api.spotify.com/v1/artists/${artist.id}/top-tracks?market=US`, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                const tracksData = await tracksResponse.json();
                
                if (tracksData.tracks && tracksData.tracks.length > 0) {
                    // Pick randomly from their top 3 tracks for variety
                    const randomIndex = Math.floor(Math.random() * Math.min(3, tracksData.tracks.length));
                    const topTrack = tracksData.tracks[randomIndex]; // Random from top 3
                    
                    // Store the track info for display and playlist creation
                    foundTracks.push({
                        artist: artistName,
                        name: topTrack.name,
                        preview_url: topTrack.preview_url,
                        external_urls: topTrack.external_urls.spotify,
                        uri: topTrack.uri // Needed for adding to playlist
                    });
                }
            }
        } catch (error) {
            console.log(`Error searching for ${artistName}:`, error);
        }
    }

    // ============================================
    // STEP 8: CREATE SPOTIFY PLAYLIST WITH ALL FOUND TRACKS
    // ============================================
    // Create a new private playlist and add all discovered tracks to it
    let playlistUrl = null;

    if (foundTracks.length > 0) {
        try {
            // Get user ID first (needed for playlist creation)
            const userResponse = await fetch('https://api.spotify.com/v1/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const userData = await userResponse.json();
            
            // Create a new private playlist
            const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${userData.id}/playlists`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: `AI Recommendations ${new Date().toLocaleDateString()}`,
                    description: 'Generated playlist from similar artists',
                    public: false
                })
            });
            
            const playlistData = await playlistResponse.json();

            // Check if playlist creation was successful
            if (playlistData.error) {
                console.error('Playlist creation failed:', playlistData.error);
                return;
            }

            console.log('Playlist data:', playlistData); // Debug log

            // Get the playlist URL for the user to open
            if (playlistData.external_urls?.spotify) {
                playlistUrl = playlistData.external_urls.spotify;
            } else {
                playlistUrl = `https://open.spotify.com/playlist/${playlistData.id}`;
            }
            
            // Collect all track URIs for adding to playlist
            const trackUris = [];
            for (const track of foundTracks) {
                if (track.uri) {
                    trackUris.push(track.uri);
                }
            }
            
            // Add all tracks to the newly created playlist
            if (trackUris.length > 0) {
                await fetch(`https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        uris: trackUris
                    })
                });
            }
            
            console.log('Playlist created with', trackUris.length, 'tracks');
            
        } catch (error) {
            console.error('Error creating playlist:', error);
        }
    }

    // ============================================
    // STEP 9: RENDER THE RESULTS
    // ============================================
    // Display all found tracks with preview players and links
    return (
        <div className="p-8">
            <h1 className="text-2xl mb-4">Recommended Tracks</h1>
            {foundTracks.map((track, index) => (
                <div key={index} className="mb-4 p-4 border rounded">
                    <h3 className="font-bold">{track.name}</h3>
                    <p className="text-gray-600">by {track.artist}</p>
                    <div className="mt-2">
                        {/* Audio preview if available */}
                        {track.preview_url && (
                            <audio controls className="w-full">
                                <source src={track.preview_url} type="audio/mpeg" />
                            </audio>
                        )}
                        {/* Link to open song in Spotify */}
                        <a 
                            href={track.external_urls} 
                            target="_blank" 
                            className="inline-block mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                            Open in Spotify
                        </a>
                    </div>
                </div>
            ))}
            {/* Link to open the generated playlist */}
            {playlistUrl && (
                <div className="mt-8 p-4 bg-green-100 rounded-lg">
                    <h2 className="text-xl font-bold mb-2">Playlist Created!</h2>
                    <a 
                        href={playlistUrl} 
                        target="_blank" 
                        className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600"
                    >
                        Open Playlist in Spotify ({foundTracks.length} songs)
                    </a>
                </div>
            )}
        </div>
    );
}