import { sendEmail } from "../mailer.js";

interface SendSupportReceivedEmailParams {
  to: string;
  fromAddress: string;
  amount: string;
  assetCode: string;
  message?: string | null;
  txHash: string;
}

export async function sendSupportReceivedEmail({
  to,
  fromAddress,
  amount,
  assetCode,
  message,
  txHash,
}: SendSupportReceivedEmailParams): Promise<void> {
  const subject = `You received ${amount} ${assetCode} on NovaSupport`;
  
  const truncatedAddress = fromAddress.length > 8 
    ? `${fromAddress.slice(0, 4)}...${fromAddress.slice(-4)}`
    : fromAddress;

  const stellarExpertLink = `https://stellar.expert/explorer/testnet/tx/${txHash}`;

  const html = `
    <h2>You've received support!</h2>
    <p>A supporter (${truncatedAddress}) has sent you <strong>${amount} ${assetCode}</strong>.</p>
    ${message ? `<p><strong>Message:</strong> "${message}"</p>` : ""}
    <p><a href="${stellarExpertLink}">View transaction on Stellar Expert</a></p>
    <br/>
    <p>Thanks,<br/>The NovaSupport Team</p>
  `;

  await sendEmail({
    to,
    subject,
    html,
  });
}
