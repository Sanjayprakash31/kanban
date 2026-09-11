export default function handler(req, res) {
  // Read backend API URL from Vercel environment variables
  const apiUrl = process.env.BACKEND_API_URL || process.env.API_URL || '';

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  res.status(200).json({
    apiUrl: apiUrl,
    status: 'ok',
    timestamp: new Date().toISOString()
  });
}
