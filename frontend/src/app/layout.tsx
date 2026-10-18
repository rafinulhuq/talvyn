import type { Metadata } from "next";
import { Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";
import { ThemeProvider } from "@/components/ThemeProvider";
import { HighGardenTracker } from "@/components/tracking/HighGardenTracker";
import { HighGardenFeedbackWidget } from "@/components/tracking/HighGardenFeedbackWidget";
import "./globals.css";

// Body/UI face — replaces Geist Sans (visual system reskin, see
// docs/changelog/ for the dated entry). Matches the reference site's own
// body font exactly.
const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// Display face for headings — the closest free match to the reference
// site's EuclidSquare (a commercial Swiss Typefaces license we can't ship).
const displayFont = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

// Unchanged — backs the candidate exam's code-question editor only, a
// separate concern from this reskin.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Talvyn",
    template: "%s | Talvyn",
  },
  description:
    "AI-powered job description analysis and candidate assessment platform",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <WebVitalsReporter />
          <HighGardenTracker />
          <HighGardenFeedbackWidget />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
