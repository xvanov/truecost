import { useState, type FormEvent } from 'react';
import { PublicLayout } from '../components/layouts/PublicLayout';

/**
 * Contact Us Page
 * Contact form with email, phone, subject, and message fields
 */
export function ContactUs() {
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Call the Cloud Function to send email
      const functionUrl = import.meta.env.PROD
        ? 'https://us-central1-collabcanvas-dev.cloudfunctions.net/sendContactEmail'
        : 'http://localhost:5001/collabcanvas-dev/us-central1/sendContactEmail';

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send message');
      }

      setIsSubmitted(true);
      setFormData({ email: '', phone: '', subject: '', message: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message. Please try again.');
      console.error('Form submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const subjectOptions = [
    'General Inquiry',
    'Sales Question',
    'Technical Support',
    'Partnership Opportunity',
    'Feature Request',
    'Other',
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative pt-32 pb-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-truecost-cyan/5 via-transparent to-transparent pointer-events-none" />
        
        <div className="container-spacious relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border mb-5">
              <span className="text-truecost-cyan text-sm font-medium">Get in Touch</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-heading font-bold text-truecost-text-primary mb-4">
              Contact <span className="text-truecost-cyan">Us</span>
            </h1>
            
            <p className="text-xl text-truecost-text-secondary max-w-2xl mx-auto">
              Have questions about TrueCost? We'd love to hear from you. 
              Send us a message and we'll respond as soon as possible.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-16">
        <div className="container-spacious">
          <div className="max-w-2xl mx-auto">
            {isSubmitted ? (
              <div className="glass-panel p-8 md:p-12 rounded-2xl text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center">
                  <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-3xl font-heading font-bold text-truecost-text-primary mb-4">
                  Message Sent!
                </h2>
                <p className="text-lg text-truecost-text-secondary mb-8">
                  Thank you for reaching out. We'll get back to you within 24-48 hours.
                </p>
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="btn-utility"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="glass-panel p-8 md:p-12 rounded-2xl">
                <div className="space-y-5">
                  {/* Email Field */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-truecost-text-primary mb-1.5">
                      Email Address <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 rounded-xl bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary placeholder-truecost-text-muted focus:outline-none focus:border-truecost-cyan focus:ring-1 focus:ring-truecost-cyan transition-colors"
                    />
                  </div>

                  {/* Phone Field */}
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-truecost-text-primary mb-1.5">
                      Phone Number <span className="text-truecost-text-muted">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="(555) 123-4567"
                      className="w-full px-4 py-3 rounded-xl bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary placeholder-truecost-text-muted focus:outline-none focus:border-truecost-cyan focus:ring-1 focus:ring-truecost-cyan transition-colors"
                    />
                  </div>

                  {/* Subject Field */}
                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-truecost-text-primary mb-1.5">
                      Subject <span className="text-red-400">*</span>
                    </label>
                    <select
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 rounded-xl bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary focus:outline-none focus:border-truecost-cyan focus:ring-1 focus:ring-truecost-cyan transition-colors appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.5rem' }}
                    >
                      <option value="" disabled>Select a subject</option>
                      {subjectOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  {/* Message Field */}
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-truecost-text-primary mb-1.5">
                      Message <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={6}
                      placeholder="Tell us how we can help..."
                      className="w-full px-4 py-3 rounded-xl bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary placeholder-truecost-text-muted focus:outline-none focus:border-truecost-cyan focus:ring-1 focus:ring-truecost-cyan transition-colors resize-none"
                    />
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full btn-pill-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Sending...
                      </span>
                    ) : (
                      'Send Message'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

