import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';

import { useAuth } from '@/auth/AuthContext.jsx';
import Button from '@/components/ui/CustomButton.jsx';
import Input from '@/components/ui/CustomInput.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.jsx';

const REQUEST_STATUS = Object.freeze({
  idle: 'idle',
  loading: 'loading',
  success: 'success',
  error: 'error',
});

export default function ForgotPassword() {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(REQUEST_STATUS.idle);
  const [errorMessage, setErrorMessage] = useState('');

  const isLoading = status === REQUEST_STATUS.loading;
  const isSuccess = status === REQUEST_STATUS.success;
  const isError = status === REQUEST_STATUS.error;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setErrorMessage('נא להזין כתובת דוא"ל.');
      setStatus(REQUEST_STATUS.error);
      return;
    }

    setStatus(REQUEST_STATUS.loading);
    setErrorMessage('');

    try {
      await resetPasswordForEmail(trimmedEmail);
      setStatus(REQUEST_STATUS.success);
    } catch (error) {
      console.error('Failed to request password reset', error);
      setErrorMessage(error?.message || 'שליחת בקשת איפוס הסיסמה נכשלה. נסו שוב מאוחר יותר.');
      setStatus(REQUEST_STATUS.error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex items-center justify-center px-4 py-10" dir="rtl">
      <Card className="w-full max-w-lg border-slate-200 shadow-xl">
        <CardHeader className="bg-gradient-to-l from-blue-500 to-indigo-500 text-white rounded-t-lg space-y-2 text-right">
          <CardTitle className="flex items-center justify-end gap-2 text-2xl font-bold">
            <span>איפוס סיסמה</span>
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          </CardTitle>
          <CardDescription className="text-blue-100 text-sm leading-relaxed">
            הזינו את כתובת הדוא"ל שלכם ונשלח אליכם קישור לעדכון הסיסמה.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {isSuccess ? (
            <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800" role="status">
              <AlertTitle>בקשה התקבלה</AlertTitle>
              <AlertDescription>
                אם קיים חשבון עם כתובת דוא"ל זו, שלחנו הוראות לאיפוס הסיסמה. בדקו את תיבת הדואר הנכנס שלכם.
              </AlertDescription>
            </Alert>
          ) : null}

          {isError && !isSuccess ? (
            <Alert className="bg-red-50 border-red-200 text-red-700" role="alert">
              <AlertTitle>אירעה שגיאה</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <Input
              type="email"
              label={'דוא"ל ארגוני'}
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={isLoading || isSuccess}
            />

            <div className="flex flex-col gap-3 text-sm text-right">
              <Button type="submit" disabled={isLoading || isSuccess} className="w-full">
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    שולח בקשה...
                  </span>
                ) : (
                  'שלחו הוראות לאיפוס'
                )}
              </Button>
              <Link
                to="/login"
                className="text-sm font-medium text-blue-600 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 rounded-md px-1 self-end"
              >
                חזרה למסך ההתחברות
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
