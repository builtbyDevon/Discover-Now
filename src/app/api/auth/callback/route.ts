import { NextRequest, NextResponse } from 'next/server';
const client_id = '203a12ee77e740d6bf076371fb0e6a86';
const client_secret = '715bb3d81f1545cc83d235ee9d0c88a1';



export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    let status = '';

    // Getting url of site dynamically
    const redirect_uri = 'http://127.0.0.1:3000/api/auth/callback';

    if (state === null) {
        status = 'State Error';
        console.log(status);
      } else {

        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
            },
            body: new URLSearchParams({
            code: code,
            redirect_uri: redirect_uri,
            grant_type: 'authorization_code'
            })
        });

        const tokenData = await tokenResponse.json();
        // console.log('Token response:', tokenData);

        if (tokenData.error) {
            // console.log('Token error:', tokenData.error);
            return NextResponse.redirect(new URL('/?error=invalid_grant', 'http://127.0.0.1:3000'));
        }

        const response = NextResponse.redirect(new URL('/dashboard', 'http://127.0.0.1:3000'));
        response.cookies.set('spotify_access_token', tokenData.access_token, {
            httpOnly: true,
            // secure: process.env.NODE_ENV === 'production',
            path: '/', // Add this
            sameSite: 'lax',
            maxAge: tokenData.expires_in
        });

        return response;
    }
 
  }