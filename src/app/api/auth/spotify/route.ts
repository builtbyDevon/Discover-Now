import { NextRequest, NextResponse } from 'next/server';
const client_id = '203a12ee77e740d6bf076371fb0e6a86';


let generateRandomString = (length: number) => {
  let result = '';
  while (result.length < length) {
    result += Math.random().toString(36).slice(2);
  }
  return result.slice(0, length);
};

export async function GET(request: NextRequest) {
    const state = generateRandomString(16);
    const scope = 'user-read-private user-read-email user-library-read playlist-modify-private';

    // Getting url of site dynamically
    const redirect_uri = `http://127.0.0.1:3000/api/auth/callback`;

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', client_id);
    authUrl.searchParams.append('redirect_uri', redirect_uri);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('state', state);


    // console.log('auth url is ', authUrl);
    

    return NextResponse.redirect(authUrl);
  }