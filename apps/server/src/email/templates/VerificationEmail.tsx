import { Text } from "@react-email/components";
import { EmailShell, EmberButton, bodyText, headingText, mutedText } from "./EmailShell";

export function VerificationEmail({ name, url }: { name: string; url: string }) {
  return (
    <EmailShell preview="Your seat is reserved — one click and you're in.">
      <Text style={headingText}>Your seat is reserved.</Text>
      <Text style={bodyText}>
        {name ? `${name}, the` : "The"} table's waiting. One click confirms your email and deals
        you in to the University of Sheffield Poker Society — online tables, leaderboards, the lot.
      </Text>
      <EmberButton href={url}>TAKE MY SEAT</EmberButton>
      <Text style={mutedText}>
        The link expires in an hour. If you didn't sign up to UOS Poker, ignore this — the seat
        goes back to the floor.
      </Text>
    </EmailShell>
  );
}
