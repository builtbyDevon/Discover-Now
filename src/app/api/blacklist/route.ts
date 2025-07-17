import { NextRequest, NextResponse } from 'next/server';
import { blacklistArtist } from '@/lib/songDatabase';

export async function POST(request: NextRequest) {
    try {
        const { artistName } = await request.json();
        
        if (!artistName) {
            return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
        }
        
        blacklistArtist(artistName);
        
        return NextResponse.json({ 
            success: true, 
            message: `${artistName} has been blacklisted` 
        });
        
    } catch (error) {
        console.error('Error blacklisting artist:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 