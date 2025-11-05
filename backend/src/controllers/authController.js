import clerk from '../config/clerk.js';

/**
 * Get Google OAuth token for the authenticated user
 * This endpoint uses Clerk's backend API to retrieve OAuth tokens
 */
export const getGoogleToken = async (req, res) => {
  try {
    const { userId } = req;

    // Use Clerk's backend API to get the user's OAuth information
    const user = await clerk.users.getUser(userId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    console.log('=== CLERK USER DEBUG ===');
    console.log('User ID:', userId);
    console.log('User object keys:', Object.keys(user));
    console.log('External accounts:', JSON.stringify(user.externalAccounts, null, 2));

    // Check if user has Google connected
    const googleAccount = user.externalAccounts?.find((account) => account.provider === 'google');

    if (!googleAccount) {
      console.warn(
        'No Google provider found. Available providers:',
        user.externalAccounts?.map((a) => a.provider)
      );
      return res.status(400).json({
        error: 'Google account not connected',
        message:
          'User needs to sign in with Google. Clerk backend cannot retrieve OAuth tokens directly.',
        solution:
          'The frontend should get the token from Clerk useSession() hook or request new OAuth on the client side.',
      });
    }

    console.log('Google account found:', JSON.stringify(googleAccount, null, 2));

    // NOTE: Clerk's backend API does NOT provide access tokens for security reasons
    // We need a different approach - see comment below
    return res.status(400).json({
      error: 'OAuth token retrieval not available',
      message: 'Clerk backend API does not expose OAuth access tokens for security reasons',
      solution: 'Need to implement frontend OAuth token retrieval or use a server-side OAuth flow',
      googleAccountFound: true,
      googleEmail: googleAccount.emailAddress,
    });
  } catch (error) {
    console.error('Get Google token error:', error);
    res.status(500).json({
      error: 'Failed to get Google token',
      message: error.message,
    });
  }
};
