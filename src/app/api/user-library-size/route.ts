import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Helper function to make authenticated Spotify API requests with auto-refresh
async function makeSpotifyRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('spotify_access_token')?.value;
    
    if (!accessToken) {
        throw new Error('No valid access token available');
    }

    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        ...options.headers
    };

    return fetch(url, {
        ...options,
        headers
    });
}

export async function GET(request: NextRequest) {
    try {
        // Get total count of user's liked tracks
        const response = await makeSpotifyRequest('https://api.spotify.com/v1/me/tracks?limit=1');
        
        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch library size' }, { status: response.status });
        }
        
        const data = await response.json();
        const totalTracks = data.total || 0;

        return NextResponse.json({ 
            success: true, 
            totalTracks 
        });

    } catch (error) {
        console.error('Error checking library size:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 