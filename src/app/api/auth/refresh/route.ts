import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const client_id = '203a12ee77e740d6bf076371fb0e6a86';
const client_secret = '715bb3d81f1545cc83d235ee9d0c88a1';

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const refreshToken = cookieStore.get('spotify_refresh_token')?.value;

        if (!refreshToken) {
            return NextResponse.json({ error: 'No refresh token available' }, { status: 401 });
        }

        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            })
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 });
        }

        // Create response with new token data
        const response = NextResponse.json({ 
            success: true, 
            access_token: tokenData.access_token,
            expires_in: tokenData.expires_in 
        });

        // Update access token cookie
        response.cookies.set('spotify_access_token', tokenData.access_token, {
            httpOnly: true,
            path: '/',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 // 7 days
        });

        // Update refresh token if a new one was provided
        if (tokenData.refresh_token) {
            response.cookies.set('spotify_refresh_token', tokenData.refresh_token, {
                httpOnly: true,
                path: '/',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 // 7 days
            });
        }

        // Update token expiration time
        const expiresAt = Date.now() + (tokenData.expires_in * 1000);
        response.cookies.set('spotify_token_expires_at', expiresAt.toString(), {
            httpOnly: true,
            path: '/',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 // 7 days
        });

        return response;

    } catch (error) {
        console.error('Error refreshing token:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 