import { PublicLayout } from '../components/layouts/PublicLayout';

// Team member images
import kalinImg from '../assets/team/truecost-kalin.jpeg';
import yahavImg from '../assets/team/truecost-yahav.jpeg';
import ankitImg from '../assets/team/truecost-ankit.jpeg';
import kishorImg from '../assets/team/truecost-kishor.jpeg';
import atharvaImg from '../assets/team/truecost-atharva.jpeg';

// Team member descriptions
import {
  kalin_desc,
  yahav_desc,
  ankit_desc,
  kishor_desc,
  atharva_desc,
} from '../assets/desc/teamDescriptions';

/**
 * About Us Page
 * Company information and team member profiles
 */
export function AboutUs() {
  const teamMembers = [
    {
      name: 'Kalin Ivanov',
      role: 'Co-Founder & CEO',
      image: kalinImg,
      desc: kalin_desc,
    },
    {
      name: 'Yahav Corcos',
      role: 'Co-Founder & COO',
      image: yahavImg,
      desc: yahav_desc,
    },
    {
      name: 'Ankit Rijal',
      role: 'Co-Founder & CTO',
      image: ankitImg,
      desc: ankit_desc,
    },
    {
      name: 'Kishor Kashid',
      role: 'Co-Founder & CFO',
      image: kishorImg,
      desc: kishor_desc,
    },
    {
      name: 'Atharva Sardar',
      role: 'Co-Founder & Lead AI Engineer',
      image: atharvaImg,
      desc: atharva_desc,
    },
  ];

  const values = [
    {
      title: 'Accuracy',
      description: 'We believe every estimate should be as close to reality as possible. Our AI is continuously refined using real project data.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'Innovation',
      description: 'We push the boundaries of what\'s possible in construction technology, bringing cutting-edge AI to an industry ready for transformation.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: 'Transparency',
      description: 'Every cost in our estimates is traceable and explainable. We show you exactly how we arrived at each number.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-truecost-cyan/5 via-transparent to-transparent pointer-events-none" />
        
        <div className="container-spacious relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border mb-5">
              <span className="text-truecost-cyan text-sm font-medium">Our Story</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-heading font-bold text-truecost-text-primary mb-4">
              About <span className="text-truecost-cyan">TrueCost</span>
            </h1>
            
            <p className="text-xl text-truecost-text-secondary max-w-2xl mx-auto">
              We're on a mission to bring accuracy, speed, and transparency to construction 
              cost estimation through the power of artificial intelligence.
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="pt-12 pb-40">
        <div className="container-spacious">
          <div className="max-w-4xl mx-auto">
            <div className="glass-panel p-8 md:p-12 rounded-2xl">
              <h2 className="text-3xl font-heading font-bold text-truecost-text-primary mb-6">
                Our Mission
              </h2>
              <p className="text-lg text-truecost-text-secondary leading-relaxed mb-6">
                Construction cost estimation has long been a time-consuming, error-prone process 
                that relies heavily on experience and guesswork. We founded TrueCost to change that.
              </p>
              <p className="text-lg text-truecost-text-secondary leading-relaxed">
                By combining deep construction industry expertise with cutting-edge AI technology, 
                we've created a platform that generates accurate, detailed estimates in minutes 
                instead of days. Our goal is to empower contractors, architects, and project owners 
                with the information they need to make confident decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-truecost-glass-bg/30">
        <div className="container-spacious">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-truecost-text-primary mb-4">
              Our Values
            </h2>
            <p className="text-xl text-truecost-text-secondary">
              The principles that guide everything we do
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value) => (
              <div key={value.title} className="text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-truecost-cyan/10 border border-truecost-cyan/30 flex items-center justify-center text-truecost-cyan">
                  {value.icon}
                </div>
                <h3 className="text-2xl font-heading font-semibold text-truecost-text-primary mb-3">
                  {value.title}
                </h3>
                <p className="text-truecost-text-secondary">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20">
        <div className="container-spacious">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-truecost-text-primary mb-4">
              Meet the Team
            </h2>
            <p className="text-xl text-truecost-text-secondary">
              The people behind TrueCost
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {teamMembers.map((member, index) => (
              <div 
                key={index}
                className="glass-panel p-6 rounded-2xl hover:border-truecost-cyan/50 transition-colors"
              >
                {/* Headshot placeholder */}
                <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-truecost-glass-bg border-2 border-truecost-glass-border flex items-center justify-center overflow-hidden">
                  {member.image ? (
                    <img 
                      src={member.image} 
                      alt={member.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg className="w-16 h-16 text-truecost-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>
                
                <div className="text-center">
                  <h3 className="text-xl font-heading font-semibold text-truecost-text-primary mb-1">
                    {member.name}
                  </h3>
                  <p className={`text-truecost-cyan font-medium${member.desc ? ' mb-3' : ''}`}>
                    {member.role}
                  </p>
                  {member.desc && (
                    <p className="text-truecost-text-secondary text-sm leading-relaxed">
                      {member.desc}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

