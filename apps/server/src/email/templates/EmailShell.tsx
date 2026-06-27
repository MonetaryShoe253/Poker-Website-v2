import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

/**
 * STEEL/EMBER email shell. Email clients are hostile: table-based layout,
 * inline styles, solid colours, and a deliberate dark design that still
 * reads if a client forces light text handling.
 */

export const palette = {
  bg: "#0A0B0D",
  panel: "#121417",
  panelEdge: "#2A2F36",
  text: "#D7DCE3",
  muted: "#8B93A1",
  ember: "#FF2D40",
  emberDeep: "#C8102E",
};

export function EmailShell({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: palette.bg, margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: "520px", margin: "0 auto", padding: "32px 16px" }}>
          {/* Wordmark */}
          <Section style={{ textAlign: "center" as const, paddingBottom: "12px" }}>
            <Text
              style={{
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: "20px",
                letterSpacing: "4px",
                fontWeight: 700,
                color: palette.text,
                margin: 0,
              }}
            >
              <span style={{ color: palette.ember }}>♠</span>&nbsp;UOS&nbsp;
              <span style={{ color: palette.ember }}>POKER</span>
            </Text>
          </Section>
          {/* Ember rail */}
          <Section
            style={{
              borderTop: `2px solid ${palette.ember}`,
              marginBottom: "0",
              lineHeight: "0",
              fontSize: "0",
            }}
          >
            &nbsp;
          </Section>
          {/* Panel */}
          <Section
            style={{
              backgroundColor: palette.panel,
              border: `1px solid ${palette.panelEdge}`,
              borderRadius: "8px",
              padding: "32px 28px",
            }}
          >
            {children}
          </Section>
          {/* Footer */}
          <Section style={{ textAlign: "center" as const, paddingTop: "20px" }}>
            <Text style={{ color: palette.muted, fontSize: "12px", margin: 0, lineHeight: "18px" }}>
              University of Sheffield Poker Society
              <br />
              Play-money only — no real-money gambling on this site.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function EmberButton({ href, children }: { href: string; children: ReactNode }) {
  // Bulletproof-ish button: a padded link in a rounded table cell.
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "24px auto" }}>
      <tbody>
        <tr>
          <td
            style={{
              backgroundColor: palette.emberDeep,
              borderRadius: "6px",
              boxShadow: `0 0 16px rgba(255,45,64,0.45)`,
            }}
          >
            <a
              href={href}
              style={{
                display: "inline-block",
                padding: "13px 32px",
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "1px",
                color: "#FFFFFF",
                textDecoration: "none",
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export const bodyText = {
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "15px",
  lineHeight: "24px",
  color: palette.text,
  margin: "0 0 14px",
};

export const headingText = {
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "22px",
  lineHeight: "30px",
  fontWeight: 700,
  color: palette.text,
  margin: "0 0 16px",
};

export const mutedText = {
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "13px",
  lineHeight: "20px",
  color: palette.muted,
  margin: "14px 0 0",
};
