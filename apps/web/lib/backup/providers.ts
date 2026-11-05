/** The off-site stores Master control → Data offers (0172) — no Node modules, so the page can read it too. */
export const PROVIDERS = {
  r2: { label: "Cloudflare R2", cost: "Free up to 10 GB", endpoint: "https://<account-id>.r2.cloudflarestorage.com", region: "auto", help: "Cloudflare → R2 → Manage API tokens → Create (Object Read & Write)" },
  b2: { label: "Backblaze B2", cost: "Free up to 10 GB", endpoint: "https://s3.<region>.backblazeb2.com", region: "us-west-004", help: "Backblaze → Application Keys → Add a New Application Key" },
  s3: { label: "Amazon S3", cost: "Paid · about $0.025 a GB a month", endpoint: "https://s3.ap-south-1.amazonaws.com", region: "ap-south-1", help: "AWS → IAM → Users → Security credentials → Create access key" },
  other: { label: "Other S3-compatible", cost: "Depends on the provider", endpoint: "https://", region: "us-east-1", help: "The provider's S3 endpoint, region, bucket and access key" },
} as const;
export type Provider = keyof typeof PROVIDERS;
