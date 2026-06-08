"use client";

import { AuthProvider } from "@/app/contexts/useAuth";
import RecordingOverlay from "../../components/ui/RecordingOverlay";
import { MotionProvider } from "@/app/contexts/MotionContext";
import { RecordingProvider } from "@/app/contexts/RecordingContext";

export default function EditorLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <RecordingProvider>
                <MotionProvider>
                    <div className="min-h-screen bg-neutral-950">
                        {children}
                    </div>
                </MotionProvider>
                <RecordingOverlay />
            </RecordingProvider>
        </AuthProvider>
    );
}
