import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'recommended-songs.json');
const BLACKLIST_PATH = path.join(process.cwd(), 'data', 'blacklisted-artists.json');

export interface RecommendedSong {
    uri: string;
    name: string;
    artist: string;
    dateAdded: string;
}

export interface BlacklistedArtist {
    name: string;
    dateBlacklisted: string;
}

// Ensure data directory exists
function ensureDataDir() {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

// Load existing recommended songs
export function loadRecommendedSongs(): RecommendedSong[] {
    ensureDataDir();
    
    if (!fs.existsSync(DB_PATH)) {
        return [];
    }
    
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading recommended songs:', error);
        return [];
    }
}

// Save recommended songs
export function saveRecommendedSongs(songs: RecommendedSong[]) {
    ensureDataDir();
    
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(songs, null, 2));
    } catch (error) {
        console.error('Error saving recommended songs:', error);
    }
}

// Check if a song was already recommended
export function isSongRecommended(uri: string): boolean {
    const songs = loadRecommendedSongs();
    return songs.some(song => song.uri === uri);
}

// Add a new recommended song
export function addRecommendedSong(song: RecommendedSong) {
    const songs = loadRecommendedSongs();
    
    // Don't add duplicates
    if (!songs.some(s => s.uri === song.uri)) {
        songs.push(song);
        saveRecommendedSongs(songs);
    }
}

// Get all recommended songs for an artist
export function getRecommendedSongsForArtist(artistName: string): RecommendedSong[] {
    const songs = loadRecommendedSongs();
    return songs.filter(song => song.artist.toLowerCase() === artistName.toLowerCase());
}

// Check if an artist has reached the recommendation limit (default 3 songs)
export function hasArtistReachedLimit(artistName: string, limit: number = 3): boolean {
    const artistSongs = getRecommendedSongsForArtist(artistName);
    return artistSongs.length >= limit;
}

// ============================================
// BLACKLIST FUNCTIONS
// ============================================

// Load blacklisted artists
export function loadBlacklistedArtists(): BlacklistedArtist[] {
    ensureDataDir();
    
    if (!fs.existsSync(BLACKLIST_PATH)) {
        return [];
    }
    
    try {
        const data = fs.readFileSync(BLACKLIST_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading blacklisted artists:', error);
        return [];
    }
}

// Save blacklisted artists
export function saveBlacklistedArtists(artists: BlacklistedArtist[]) {
    ensureDataDir();
    
    try {
        fs.writeFileSync(BLACKLIST_PATH, JSON.stringify(artists, null, 2));
    } catch (error) {
        console.error('Error saving blacklisted artists:', error);
    }
}

// Check if an artist is blacklisted
export function isArtistBlacklisted(artistName: string): boolean {
    const blacklistedArtists = loadBlacklistedArtists();
    return blacklistedArtists.some(artist => artist.name.toLowerCase() === artistName.toLowerCase());
}

// Add an artist to blacklist
export function blacklistArtist(artistName: string) {
    const blacklistedArtists = loadBlacklistedArtists();
    
    // Don't add duplicates
    if (!blacklistedArtists.some(artist => artist.name.toLowerCase() === artistName.toLowerCase())) {
        blacklistedArtists.push({
            name: artistName,
            dateBlacklisted: new Date().toISOString()
        });
        saveBlacklistedArtists(blacklistedArtists);
        console.log(`Blacklisted artist: ${artistName}`);
    }
} 