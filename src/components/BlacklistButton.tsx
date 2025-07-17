'use client';
import { useState } from 'react';

interface BlacklistButtonProps {
    artistName: string;
}

export default function BlacklistButton({ artistName }: BlacklistButtonProps) {
    const [isBlacklisting, setIsBlacklisting] = useState(false);
    const [isBlacklisted, setIsBlacklisted] = useState(false);

    const handleBlacklist = async () => {
        if (isBlacklisted || isBlacklisting) return;
        
        setIsBlacklisting(true);
        
        try {
            const response = await fetch('/api/blacklist', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ artistName }),
            });
            
            if (response.ok) {
                setIsBlacklisted(true);
                console.log(`${artistName} has been blacklisted`);
            } else {
                console.error('Failed to blacklist artist');
            }
        } catch (error) {
            console.error('Error blacklisting artist:', error);
        } finally {
            setIsBlacklisting(false);
        }
    };

    return (
        <button
            onClick={handleBlacklist}
            disabled={isBlacklisting || isBlacklisted}
            className={`ml-2 px-3 py-1 text-sm rounded ${
                isBlacklisted 
                    ? 'bg-gray-500 text-white cursor-not-allowed' 
                    : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
        >
            {isBlacklisting ? '...' : isBlacklisted ? 'Blacklisted' : '🚫 Don\'t Recommend'}
        </button>
    );
} 