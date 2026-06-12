import { Text } from "@react-email/components";
import { EmailShell, EmberButton, bodyText, headingText, mutedText, palette } from "./EmailShell";

export function WelcomeEmail({
  name,
  siteUrl,
  nextSession,
}: {
  name: string;
  siteUrl: string;
  nextSession: string | null;
}) {
  return (
    <EmailShell preview="You're in. Here's where the chips are.">
      <Text style={headingText}>You're in{name ? `, ${name}` : ""}.</Text>
      <Text style={bodyText}>
        Welcome to UOS Poker. Two ways to play: in person on campus —{" "}
        <strong style={{ color: palette.text }}>
          {nextSession ?? "Tuesday tournaments & Thursday cash games, 17:00–20:00"}
        </strong>{" "}
        — and online, any hour the mood strikes.
      </Text>
      <EmberButton href={`${siteUrl}/play`}>DEAL ME IN</EmberButton>
      <Text style={bodyText}>
        <a href={`${siteUrl}/learn`} style={{ color: palette.ember }}>
          New to poker? Start here
        </a>
        <br />
        <a href={`${siteUrl}/leaderboards`} style={{ color: palette.ember }}>
          See the leaderboards
        </a>
        <br />
        <a href={`${siteUrl}/sessions`} style={{ color: palette.ember }}>
          Weekly sessions — what to expect
        </a>
      </Text>
      <Text style={mutedText}>Play-money only. Bring your A-game, not your rent.</Text>
    </EmailShell>
  );
}
