import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Calendar, BarChart3, Shield, Sparkles, CheckCircle2 } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();

  const features = [
    {
      icon: Users,
      title: 'ניהול תלמידים',
      description: 'מעקב מלא אחר כל תלמיד ותלמידה, כולל פרטי קשר, מדריך מקצועי ולוח זמנים אישי',
    },
    {
      icon: Calendar,
      title: 'תיעוד מפגשים',
      description: 'רישום מהיר ונוח של מפגשי הדרכה עם טפסים מותאמים אישית לצרכי הארגון',
    },
    {
      icon: BarChart3,
      title: 'דוחות ותובנות',
      description: 'ניתוח נתונים מתקדם, דוחות מפורטים ומעקב אחר התקדמות לאורך זמן',
    },
    {
      icon: Shield,
      title: 'אבטחה ופרטיות',
      description: 'הגנה מלאה על מידע רגיש עם הצפנה, גיבויים אוטומטיים ובקרת גישה מתקדמת',
    },
    {
      icon: Sparkles,
      title: 'ממשק נוח וידידותי',
      description: 'עיצוב מודרני ואינטואיטיבי המותאם לעברית ולשימוש יומיומי',
    },
    {
      icon: CheckCircle2,
      title: 'תמיכה מלאה',
      description: 'צוות תמיכה מסור וזמין לעזרה בכל שלב',
    },
  ];

  const benefits = [
    'חיסכון משמעותי בזמן ניהול',
    'מעקב אחר כל מפגש והתקדמות',
    'דוחות מפורטים למנהלים ולהנהלה',
    'גישה מכל מקום ומכל מכשיר',
    'התאמה אישית מלאה לצרכי הארגון',
    'עדכונים ושיפורים רציפים',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background" dir="rtl">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="TutTiud" className="h-8 w-8" />
            <span className="text-xl font-bold text-primary">TutTiud</span>
          </div>
          <Button onClick={() => navigate('/login')} className="gap-2">
            <span>כניסה למערכת</span>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            מערכת ניהול הדרכה
            <br />
            <span className="text-primary">חכמה ויעילה</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600 sm:text-xl">
            TutTiud היא הפלטפורמה המתקדמת לניהול תלמידים, תיעוד מפגשים ומעקב אחר התקדמות.
            כל מה שצוות ההדרכה שלכם צריך, במקום אחד.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={() => navigate('/login')} className="gap-2 text-lg">
              <span>התחילו עכשיו</span>
            </Button>
            <Button size="lg" variant="outline" onClick={() => {
              document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
            }} className="text-lg">
              למידע נוסף
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            כל מה שצריך לניהול מוצלח
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-neutral-600">
            מערכת מקיפה עם כלים מתקדמים לכל היבט של ההדרכה
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Card key={index} className="border-2 transition-all hover:border-primary/50 hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 text-right">
                    <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                    <p className="mt-2 text-sm text-neutral-600">{feature.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-primary/5 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              למה לבחור ב-TutTiud?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-neutral-600">
              הצטרפו לעשרות ארגונים שכבר משתמשים במערכת שלנו
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-3xl">
            <div className="grid gap-4 sm:grid-cols-2">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-3 rounded-lg bg-background p-4 shadow-sm">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-primary" />
                  <span className="text-sm font-medium text-foreground">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="rounded-2xl bg-primary px-6 py-16 text-center shadow-xl sm:px-12">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            מוכנים להתחיל?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/90">
            הצטרפו למערכת עוד היום והתחילו לנהל את ההדרכה שלכם בצורה החכמה ביותר
          </p>
          <div className="mt-8">
            <Button
              size="lg"
              variant="secondary"
              onClick={() => navigate('/login')}
              className="gap-2 text-lg shadow-lg hover:shadow-xl"
            >
              <span>כניסה למערכת</span>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-neutral-50 py-8">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2 text-neutral-600">
            <img src="/icon.svg" alt="TutTiud" className="h-6 w-6" />
            <span className="font-semibold">TutTiud</span>
            <span className="text-neutral-400">•</span>
            <span className="text-sm">מערכת ניהול הדרכה מתקדמת</span>
          </div>
          <p className="mt-4 text-sm text-neutral-500">
            © {new Date().getFullYear()} TutTiud. כל הזכויות שמורות.
          </p>
        </div>
      </footer>
    </div>
  );
}
