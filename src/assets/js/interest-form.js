
(function () {
  'use strict';

  const UTILS_URL =
    '/assets/vendor/intl-tel-input/js/utils.js';

  /*
   * Enquiries are emailed through Web3Forms. The access key and endpoint are
   * written onto each form (data-web3forms-key / data-web3forms-endpoint) from .env at build time.
   */
  const SUBMISSION_TIMEOUT_MS = 10000;

  /*
   * Successful enquiry lock.
   * One completed submission is allowed per browser/device every 24 hours.
   * Stored in both localStorage and a first-party cookie for resilience.
   */
  const SUBMISSION_LOCK_KEY = 'abs_interest_submission_24h_v1';
  const SUBMISSION_LOCK_COOKIE = 'abs_interest_submission_24h_v1';
  const SUBMISSION_LOCK_MS = 24 * 60 * 60 * 1000;

  function createSubmissionId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === 'function'
    ) {
      return window.crypto.randomUUID();
    }

    return (
      'lead-' +
      Date.now() +
      '-' +
      Math.random().toString(36).slice(2, 12)
    );
  }

  function resetSubmissionTracking(form) {
    delete form.dataset.submissionId;
    delete form.dataset.submittedAt;
  }

  function readSubmissionLockTimestamp() {
    const timestamps = [];

    try {
      const stored = Number(
        window.localStorage.getItem(SUBMISSION_LOCK_KEY)
      );

      if (Number.isFinite(stored) && stored > 0) {
        timestamps.push(stored);
      }
    } catch (error) {
      // Storage can be unavailable in restricted/private browser modes.
    }

    try {
      const cookiePrefix = SUBMISSION_LOCK_COOKIE + '=';
      const cookieParts = document.cookie
        ? document.cookie.split(';')
        : [];

      cookieParts.forEach(function (part) {
        const trimmed = part.trim();

        if (trimmed.indexOf(cookiePrefix) !== 0) {
          return;
        }

        const cookieValue = Number(
          decodeURIComponent(
            trimmed.slice(cookiePrefix.length)
          )
        );

        if (
          Number.isFinite(cookieValue) &&
          cookieValue > 0
        ) {
          timestamps.push(cookieValue);
        }
      });
    } catch (error) {
      // Ignore cookie read errors and fall back to localStorage.
    }

    if (!timestamps.length) {
      return 0;
    }

    return Math.max.apply(Math, timestamps);
  }

  function clearSubmissionLock() {
    try {
      window.localStorage.removeItem(SUBMISSION_LOCK_KEY);
    } catch (error) {
      // Ignore storage errors.
    }

    try {
      document.cookie =
        SUBMISSION_LOCK_COOKIE +
        '=; Max-Age=0; Path=/; SameSite=Lax';
    } catch (error) {
      // Ignore cookie errors.
    }
  }

  function writeSubmissionLock(timestamp) {
    const value = String(timestamp);

    try {
      window.localStorage.setItem(
        SUBMISSION_LOCK_KEY,
        value
      );
    } catch (error) {
      // Cookie fallback remains available.
    }

    try {
      document.cookie =
        SUBMISSION_LOCK_COOKIE +
        '=' +
        encodeURIComponent(value) +
        '; Max-Age=' +
        Math.floor(SUBMISSION_LOCK_MS / 1000) +
        '; Path=/; SameSite=Lax';
    } catch (error) {
      // Ignore cookie errors.
    }
  }

  function getActiveSubmissionLock() {
    const timestamp = readSubmissionLockTimestamp();

    if (!timestamp) {
      return null;
    }

    const expiresAt = timestamp + SUBMISSION_LOCK_MS;
    const remainingMs = expiresAt - Date.now();

    if (remainingMs <= 0) {
      clearSubmissionLock();
      return null;
    }

    return {
      submittedAt: timestamp,
      expiresAt: expiresAt,
      remainingMs: remainingMs
    };
  }

  function formatNextSubmissionTime(timestamp) {
    try {
      return new Date(timestamp).toLocaleString(
        undefined,
        {
          dateStyle: 'medium',
          timeStyle: 'short'
        }
      );
    } catch (error) {
      return new Date(timestamp).toLocaleString();
    }
  }

  function buildLockedStatusHtml(lock, justSubmitted) {
    const title = justSubmitted
      ? 'Your email has been submitted.'
      : 'Your details have already been submitted.';

    const copy = justSubmitted
      ? 'Thank you. Your enquiry has been received successfully. You can submit another enquiry after 24 hours.'
      : 'Only one enquiry can be submitted from this browser/device within 24 hours.';

    return (
      '<div class="abs-interest__success-icon" aria-hidden="true">' +
        '<span>✓</span>' +
      '</div>' +
      '<h4 class="abs-interest__success-title">' +
        title +
      '</h4>' +
      '<p class="abs-interest__success-copy">' +
        copy +
      '</p>' +
      '<span class="abs-interest__success-time">' +
        'Next submission: ' +
        formatNextSubmissionTime(lock.expiresAt) +
      '</span>'
    );
  }

  function showSubmissionLockedState(
    form,
    lock,
    justSubmitted
  ) {
    if (!form || !lock) {
      return;
    }

    form.classList.add('is-submission-locked');

    const status = form.querySelector('[data-form-status]');

    if (status) {
      status.className =
        'abs-interest__status ' +
        'abs-interest__status--success ' +
        'abs-interest__status--locked';

      status.innerHTML =
        buildLockedStatusHtml(lock, !!justSubmitted);

      status.hidden = false;

      if (justSubmitted) {
        status.focus();

        status.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }

    if (form.dataset.unlockTimer) {
      window.clearTimeout(
        Number(form.dataset.unlockTimer)
      );
    }

    const timer = window.setTimeout(function () {
      clearSubmissionLock();
      form.classList.remove('is-submission-locked');
      hideFormStatus(form);
      delete form.dataset.unlockTimer;
      form.dataset.startedAt = String(Date.now());
    }, Math.min(lock.remainingMs + 1000, 2147483000));

    form.dataset.unlockTimer = String(timer);
  }

  function applySubmissionLockToAllForms(
    timestamp,
    justSubmitted
  ) {
    const lock = {
      submittedAt: timestamp,
      expiresAt: timestamp + SUBMISSION_LOCK_MS,
      remainingMs:
        timestamp + SUBMISSION_LOCK_MS - Date.now()
    };

    document
      .querySelectorAll('[data-project-inquiry-form]')
      .forEach(function (form) {
        showSubmissionLockedState(
          form,
          lock,
          !!justSubmitted
        );
      });
  }

  function buildEmailFields(payload) {
    return {
      'Name': payload.full_name,
      'Email': payload.email,
      'Phone': payload.contact_phone,
      'Phone country': payload.phone_country,
      'WhatsApp': payload.whatsapp,
      'WhatsApp country': payload.whatsapp_country,
      'Unit type': payload.unit_type,
      'Interested project': payload.project,
      'Message': payload.additional_message || '-',
      'Agreed to be contacted': payload.marketing_consent,
      'Source page': payload.source_page,
      'Source URL': payload.source_url,
      'Submitted at': payload.submitted_at,
      'Submission ID': payload.submission_id
    };
  }

  async function submitToWeb3Forms(form, payload) {
    const accessKey = cleanString(form.dataset.web3formsKey);
    const endpoint = cleanString(form.dataset.web3formsEndpoint);

    if (!accessKey || !endpoint) {
      throw new Error(
        'WEB3FORMS_ACCESS_KEY is not set in .env, so the enquiry cannot be emailed.'
      );
    }

    const controller = new AbortController();

    const timeout = window.setTimeout(function () {
      controller.abort();
    }, SUBMISSION_TIMEOUT_MS);

    const body = Object.assign(
      {
        access_key: accessKey,
        subject:
          'New enquiry: ' + payload.project + ' - ' + payload.full_name,
        from_name: 'Iqbal Estate Website',
        replyto: payload.email
      },
      buildEmailFields(payload)
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      let result = null;

      try {
        result = await response.json();
      } catch (readError) {
        result = null;
      }

      if (!response.ok || !result || result.success !== true) {
        throw new Error(
          'Web3Forms rejected the enquiry: ' +
            ((result && result.message) || response.status)
        );
      }

      return true;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function cleanString(value) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).trim();
  }

  function normalizePersonName(value) {
    return cleanString(value)
      .replace(/\s+/g, ' ');
  }

  function normalizeNameForComparison(value) {
    return normalizePersonName(value)
      .toLowerCase();
  }

  function isValidPersonName(value) {
    const name = normalizePersonName(value);

    if (name.length < 2 || name.length > 50) {
      return false;
    }

    try {
      return /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(name);
    } catch (error) {
      return /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+(?:[ '\u2019-][A-Za-zÀ-ÖØ-öø-ÿĀ-ž\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+)*$/.test(name);
    }
  }

  function digitsOnly(value) {
    return cleanString(value).replace(/[^0-9]/g, '');
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isReasonableInternationalNumber(number) {
    const digits = digitsOnly(number);

    return digits.length >= 7 && digits.length <= 15;
  }

  function getCountryDataList() {
    if (
      window.intlTelInput &&
      typeof window.intlTelInput.getCountryData === 'function'
    ) {
      return window.intlTelInput.getCountryData();
    }

    return [];
  }

  function findCountryFromDialCode(number, currentCountryIso2) {
    let raw = cleanString(number);

    if (raw.indexOf('00') === 0) {
      raw = '+' + raw.substring(2);
    }

    if (raw.charAt(0) !== '+') {
      return null;
    }

    const numberDigits = digitsOnly(raw);

    if (!numberDigits) {
      return null;
    }

    const countries = getCountryDataList()
      .slice()
      .sort(function (countryA, countryB) {
        return String(countryB.dialCode).length -
          String(countryA.dialCode).length;
      });

    const matches = countries.filter(function (country) {
      return numberDigits.indexOf(String(country.dialCode)) === 0;
    });

    if (!matches.length) {
      return null;
    }

    const currentMatch = matches.find(function (country) {
      return country.iso2 === currentCountryIso2;
    });

    return currentMatch || matches[0];
  }

  function synchronizeCountryFromTypedPrefix(input, instance) {
    if (!input || !instance) {
      return;
    }

    let rawValue = cleanString(input.value);

    if (rawValue.indexOf('00') === 0) {
      rawValue = '+' + rawValue.substring(2);
    }

    if (rawValue.charAt(0) !== '+') {
      return;
    }

    const currentCountry = instance.getSelectedCountryData() || {};

    const detectedCountry = findCountryFromDialCode(
      rawValue,
      currentCountry.iso2 || ''
    );

    if (!detectedCountry) {
      return;
    }

    const allDigits = digitsOnly(rawValue);
    const dialCode = String(detectedCountry.dialCode);
    const nationalNumber = allDigits.substring(dialCode.length);

    instance.setCountry(detectedCountry.iso2);
    input.value = nationalNumber;
  }

  function initializePhoneInput(input) {
    if (!input || typeof window.intlTelInput !== 'function') {
      return null;
    }

    const instance = window.intlTelInput(input, {
      initialCountry: 'pk',
      separateDialCode: true,
      showFlags: false,
      countrySearch: true,
      formatAsYouType: true,
      strictMode: false,
      loadUtils: function () {
        return import(UTILS_URL);
      }
    });

    input.addEventListener('input', function () {
      synchronizeCountryFromTypedPrefix(input, instance);
    });

    input.addEventListener('paste', function () {
      window.setTimeout(function () {
        synchronizeCountryFromTypedPrefix(input, instance);
      }, 0);
    });

    input.addEventListener('blur', function () {
      synchronizeCountryFromTypedPrefix(input, instance);
    });

    return instance;
  }

  function waitForPhoneInstance(instance) {
    if (
      instance &&
      instance.promise &&
      typeof instance.promise.then === 'function'
    ) {
      return instance.promise.catch(function () {
        return null;
      });
    }

    return Promise.resolve();
  }

  function getPhoneDetails(input, instance) {
    if (input && instance) {
      synchronizeCountryFromTypedPrefix(input, instance);
    }

    const rawVisibleNumber = cleanString(input ? input.value : '');

    let countryData = {
      name: 'Pakistan',
      iso2: 'pk',
      dialCode: '92'
    };

    if (
      instance &&
      typeof instance.getSelectedCountryData === 'function'
    ) {
      const selectedCountry = instance.getSelectedCountryData();

      if (selectedCountry && selectedCountry.iso2) {
        countryData = selectedCountry;
      }
    }

    let internationalNumber = '';

    if (
      instance &&
      typeof instance.getNumber === 'function'
    ) {
      try {
        internationalNumber = cleanString(instance.getNumber());
      } catch (error) {
        internationalNumber = '';
      }
    }

    if (!internationalNumber) {
      if (rawVisibleNumber.charAt(0) === '+') {
        internationalNumber = '+' + digitsOnly(rawVisibleNumber);
      } else {
        let nationalDigits = digitsOnly(rawVisibleNumber);

        nationalDigits = nationalDigits.replace(/^0+/, '');

        internationalNumber =
          '+' +
          cleanString(countryData.dialCode) +
          nationalDigits;
      }
    }

    internationalNumber =
      '+' + digitsOnly(internationalNumber);

    return {
      internationalNumber: internationalNumber,
      countryName: cleanString(countryData.name),
      countryIso2: cleanString(countryData.iso2).toUpperCase(),
      dialCode: cleanString(countryData.dialCode)
        ? '+' + cleanString(countryData.dialCode)
        : '',
      nationalNumber: rawVisibleNumber
    };
  }

  function clearFieldErrors(form) {
    form
      .querySelectorAll('[aria-invalid="true"]')
      .forEach(function (field) {
        field.removeAttribute('aria-invalid');
      });

    form
      .querySelectorAll('[data-error-for]')
      .forEach(function (errorElement) {
        errorElement.textContent = '';
        errorElement.hidden = true;
      });
  }

  function clearSingleFieldError(form, fieldName) {
    const field = form.querySelector('[name="' + fieldName + '"]');

    const errorElement = form.querySelector(
      '[data-error-for="' + fieldName + '"]'
    );

    if (field) {
      field.removeAttribute('aria-invalid');
    }

    if (errorElement) {
      errorElement.textContent = '';
      errorElement.hidden = true;
    }
  }

  function showFieldError(form, fieldName, message) {
    const field = form.querySelector('[name="' + fieldName + '"]');

    const errorElement = form.querySelector(
      '[data-error-for="' + fieldName + '"]'
    );

    if (field) {
      field.setAttribute('aria-invalid', 'true');
    }

    if (errorElement) {
      errorElement.textContent = message;
      errorElement.hidden = false;
    }
  }

  function showFormStatus(form, type, message) {
    const status = form.querySelector('[data-form-status]');

    if (!status) {
      return;
    }

    status.className =
      'abs-interest__status abs-interest__status--' + type;

    status.innerHTML = message;
    status.hidden = false;
    status.focus();
  }

  function hideFormStatus(form) {
    if (
      form &&
      form.classList.contains('is-submission-locked')
    ) {
      return;
    }

    const status = form.querySelector('[data-form-status]');

    if (!status) {
      return;
    }

    status.hidden = true;
    status.textContent = '';
    status.className = 'abs-interest__status';
  }

  function setSubmittingState(form, isSubmitting) {
    const button = form.querySelector('[data-submit-button]');
    const buttonText = form.querySelector('[data-button-text]');
    const buttonLoading = form.querySelector('[data-button-loading]');

    if (button) {
      button.disabled = isSubmitting;
    }

    if (buttonText) {
      buttonText.hidden = isSubmitting;
    }

    if (buttonLoading) {
      buttonLoading.hidden = !isSubmitting;
    }
  }

  function scrollToFirstError(form) {
    const firstInvalidField = form.querySelector(
      '[aria-invalid="true"]'
    );

    if (!firstInvalidField) {
      return;
    }

    firstInvalidField.focus();

    firstInvalidField.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  function initializeProjectInquiryForm(form) {
    if (!form) {
      return;
    }

    if (form.dataset.projectInquiryInitialized === 'true') {
      return;
    }

    form.dataset.projectInquiryInitialized = 'true';
    form.dataset.startedAt = String(Date.now());

    const phoneInput = form.querySelector(
      '[name="phone_visible"]'
    );

    const whatsAppInput = form.querySelector(
      '[name="whatsapp_visible"]'
    );

    const emailInput = form.querySelector(
      '[name="email"]'
    );

    const projectSelect = form.querySelector(
      '[name="project"]'
    );

    const phoneInstance = initializePhoneInput(phoneInput);
    const whatsAppInstance = initializePhoneInput(whatsAppInput);

    const existingSubmissionLock =
      getActiveSubmissionLock();

    if (existingSubmissionLock) {
      showSubmissionLockedState(
        form,
        existingSubmissionLock,
        false
      );
    }

    const whatsAppSame = form.querySelector(
      '[data-abs-whatsapp-same]'
    );

    function syncWhatsAppFromContact() {
      if (!whatsAppSame || !whatsAppSame.checked) {
        return;
      }

      const details = getPhoneDetails(phoneInput, phoneInstance);

      if (
        whatsAppInstance &&
        typeof whatsAppInstance.setNumber === 'function' &&
        details.internationalNumber
      ) {
        whatsAppInstance.setNumber(details.internationalNumber);
      } else if (whatsAppInput) {
        whatsAppInput.value = phoneInput ? phoneInput.value : '';
      }

      if (whatsAppInput) {
        whatsAppInput.readOnly = true;
      }
    }

    if (whatsAppSame) {
      whatsAppSame.addEventListener('change', function () {
        if (whatsAppInput) {
          whatsAppInput.readOnly = whatsAppSame.checked;
        }

        if (whatsAppSame.checked) {
          syncWhatsAppFromContact();
          clearSingleFieldError(form, 'whatsapp_visible');
        }
      });

      if (phoneInput) {
        phoneInput.addEventListener('input', syncWhatsAppFromContact);
        phoneInput.addEventListener('change', syncWhatsAppFromContact);
        phoneInput.addEventListener('countrychange', syncWhatsAppFromContact);
      }
    }

    /*
     * Always keep the project placeholder selected
     * when the form first loads.
     */
    if (projectSelect) {
      projectSelect.value = '';
    }

    if (emailInput) {
      emailInput.addEventListener('blur', function () {
        emailInput.value = cleanString(emailInput.value)
          .toLowerCase();
      });
    }

    form.addEventListener('input', function (event) {
      hideFormStatus(form);

      const field = event.target;

      if (field && field.name) {
        clearSingleFieldError(form, field.name);
      }

      /*
       * Because the first and last names are compared together,
       * changing either one clears both name errors.
       */
      if (
        field &&
        (
          field.name === 'first_name' ||
          field.name === 'last_name'
        )
      ) {
        clearSingleFieldError(form, 'first_name');
        clearSingleFieldError(form, 'last_name');
      }
    });

    form.addEventListener('change', function (event) {
      hideFormStatus(form);

      const field = event.target;

      if (field && field.name) {
        clearSingleFieldError(form, field.name);
      }
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      const activeSubmissionLock =
        getActiveSubmissionLock();

      if (activeSubmissionLock) {
        showSubmissionLockedState(
          form,
          activeSubmissionLock,
          false
        );
        return;
      }

      clearFieldErrors(form);
      hideFormStatus(form);

      const formData = new FormData(form);

      const firstName = normalizePersonName(
        formData.get('first_name')
      );

      const lastName = normalizePersonName(
        formData.get('last_name')
      );

      const firstNameInput = form.querySelector(
        '[name="first_name"]'
      );

      const lastNameInput = form.querySelector(
        '[name="last_name"]'
      );

      if (firstNameInput) {
        firstNameInput.value = firstName;
      }

      if (lastNameInput) {
        lastNameInput.value = lastName;
      }

      const normalizedFirstName =
        normalizeNameForComparison(firstName);

      const normalizedLastName =
        normalizeNameForComparison(lastName);

      const email = cleanString(
        formData.get('email')
      ).toLowerCase();

      const unitType = cleanString(
        formData.get('unit_type')
      );

      const project = cleanString(
        formData.get('project')
      );

      const additionalMessage = cleanString(
        formData.get('additional_message')
      );

      const honeypot = cleanString(
        formData.get('company_website')
      );


      const consentInput = form.querySelector(
        '[name="marketing_consent"]'
      );

      const marketingConsent = consentInput && consentInput.checked
        ? 'Yes'
        : 'No';

      if (emailInput) {
        emailInput.value = email;
      }

      if (honeypot) {
        form.reset();
        resetSubmissionTracking(form);

        if (whatsAppInput) {
          whatsAppInput.readOnly = false;
        }

        if (phoneInstance) {
          phoneInstance.setCountry('pk');
        }

        if (whatsAppInstance) {
          whatsAppInstance.setCountry('pk');
        }

        if (projectSelect) {
          projectSelect.value = '';
        }

        showFormStatus(
          form,
          'success',
          '<strong>Thank you!</strong> Your inquiry has been submitted.'
        );

        return;
      }

      let hasError = false;

      const firstNameValid =
        isValidPersonName(firstName);

      const lastNameValid =
        isValidPersonName(lastName);

      if (!firstName) {
        showFieldError(
          form,
          'first_name',
          'Please enter your first name.'
        );

        hasError = true;
      } else if (firstName.length < 2) {
        showFieldError(
          form,
          'first_name',
          'First name must be at least 2 characters.'
        );

        hasError = true;
      } else if (firstName.length > 50) {
        showFieldError(
          form,
          'first_name',
          'First name cannot exceed 50 characters.'
        );

        hasError = true;
      } else if (!firstNameValid) {
        showFieldError(
          form,
          'first_name',
          'Please enter a valid first name using letters only. Spaces, apostrophes and hyphens are allowed.'
        );

        hasError = true;
      }

      if (!lastName) {
        showFieldError(
          form,
          'last_name',
          'Please enter your last name.'
        );

        hasError = true;
      } else if (lastName.length < 2) {
        showFieldError(
          form,
          'last_name',
          'Last name must be at least 2 characters.'
        );

        hasError = true;
      } else if (lastName.length > 50) {
        showFieldError(
          form,
          'last_name',
          'Last name cannot exceed 50 characters.'
        );

        hasError = true;
      } else if (!lastNameValid) {
        showFieldError(
          form,
          'last_name',
          'Please enter a valid last name using letters only. Spaces, apostrophes and hyphens are allowed.'
        );

        hasError = true;
      }

      /*
       * First and last names cannot be identical.
       * This check runs only after both names pass validation.
       */
      if (
        firstNameValid &&
        lastNameValid &&
        normalizedFirstName &&
        normalizedLastName &&
        normalizedFirstName === normalizedLastName
      ) {
        showFieldError(
          form,
          'first_name',
          'First name and last name cannot be the same.'
        );

        showFieldError(
          form,
          'last_name',
          'First name and last name cannot be the same.'
        );

        hasError = true;
      }

      if (!email) {
        showFieldError(
          form,
          'email',
          'Please enter your email address.'
        );

        hasError = true;
      } else if (!isValidEmail(email)) {
        showFieldError(
          form,
          'email',
          'Please enter a complete email address, for example name@example.com.'
        );

        hasError = true;
      }

      if (!unitType) {
        showFieldError(
          form,
          'unit_type',
          'Please select Residential or Commercial.'
        );

        hasError = true;
      }

      if (!project) {
        showFieldError(
          form,
          'project',
          'Please select the project you are interested in.'
        );

        hasError = true;
      }


      if (
        consentInput &&
        consentInput.required &&
        !consentInput.checked
      ) {
        showFieldError(
          form,
          'marketing_consent',
          'Please confirm that Iqbal Estate may contact you regarding your enquiry.'
        );

        hasError = true;
      }

      await Promise.all([
        waitForPhoneInstance(phoneInstance),
        waitForPhoneInstance(whatsAppInstance)
      ]);

      const phoneDetails = getPhoneDetails(
        phoneInput,
        phoneInstance
      );

      const whatsAppDetails = getPhoneDetails(
        whatsAppInput,
        whatsAppInstance
      );

      if (
        !phoneInput ||
        !cleanString(phoneInput.value)
      ) {
        showFieldError(
          form,
          'phone_visible',
          'Please enter your contact phone number.'
        );

        hasError = true;
      } else if (
        !isReasonableInternationalNumber(
          phoneDetails.internationalNumber
        )
      ) {
        showFieldError(
          form,
          'phone_visible',
          'Please enter a complete phone number with the correct country.'
        );

        hasError = true;
      }

      if (
        !whatsAppInput ||
        !cleanString(whatsAppInput.value)
      ) {
        showFieldError(
          form,
          'whatsapp_visible',
          'Please enter your WhatsApp number.'
        );

        hasError = true;
      } else if (
        !isReasonableInternationalNumber(
          whatsAppDetails.internationalNumber
        )
      ) {
        showFieldError(
          form,
          'whatsapp_visible',
          'Please enter a complete WhatsApp number with the correct country.'
        );

        hasError = true;
      }

      if (hasError) {
        showFormStatus(
          form,
          'error',
          '<strong>Please check the highlighted fields.</strong>'
        );

        scrollToFirstError(form);
        return;
      }

      setSubmittingState(form, true);

      const fullName = [firstName, lastName]
        .filter(Boolean)
        .join(' ');

      const sourcePage =
        cleanString(document.title) || 'Website page';

      const sourceUrl = window.location.href;

      const submissionId =
        cleanString(form.dataset.submissionId) ||
        createSubmissionId();

      const submittedAt =
        cleanString(form.dataset.submittedAt) ||
        new Date().toISOString();

      form.dataset.submissionId = submissionId;
      form.dataset.submittedAt = submittedAt;

      const messageLines = [
        'New Project Inquiry',
        '',
        'Submission ID: ' + submissionId,
        'First name: ' + firstName,
        'Last name: ' + lastName,
        'Full name: ' + fullName,
        'Email: ' + email,
        '',
        'Contact number: ' +
          phoneDetails.internationalNumber,
        'Contact country: ' +
          phoneDetails.countryName,
        'Contact country ISO: ' +
          phoneDetails.countryIso2,
        'Contact dial code: ' +
          phoneDetails.dialCode,
        '',
        'WhatsApp number: ' +
          whatsAppDetails.internationalNumber,
        'WhatsApp country: ' +
          whatsAppDetails.countryName,
        'WhatsApp country ISO: ' +
          whatsAppDetails.countryIso2,
        'WhatsApp dial code: ' +
          whatsAppDetails.dialCode,
        '',
        'Unit type: ' + unitType,
        'Project: ' + project,
        'Source page: ' + sourcePage,
        'Source URL: ' + sourceUrl
      ];

      if (additionalMessage) {
        messageLines.push('');
        messageLines.push(
          'Additional message: ' + additionalMessage
        );
      }

      const portalMessage = messageLines.join('\n');

      const payload = {
        submission_id: submissionId,

        name: fullName,
        phone: phoneDetails.internationalNumber,
        email: email,
        message: portalMessage,
        source: 'website',
        submitted_at: submittedAt,

        first_name: firstName,
        last_name: lastName,
        full_name: fullName,

        contact_phone: phoneDetails.internationalNumber,
        phone_number: phoneDetails.internationalNumber,
        phone_country: phoneDetails.countryName,
        phone_country_iso2: phoneDetails.countryIso2,
        phone_country_code: phoneDetails.dialCode,
        phone_national_number: phoneDetails.nationalNumber,

        whatsapp: whatsAppDetails.internationalNumber,
        whatsapp_number: whatsAppDetails.internationalNumber,
        whatsapp_country: whatsAppDetails.countryName,
        whatsapp_country_iso2: whatsAppDetails.countryIso2,
        whatsapp_country_code: whatsAppDetails.dialCode,
        whatsapp_national_number:
          whatsAppDetails.nationalNumber,

        unit_type: unitType,
        interested_unit: unitType,
        project: project,
        project_name: project,
        additional_message: additionalMessage,
        marketing_consent: marketingConsent,

        source_page: sourcePage,
        source_url: sourceUrl,
        form_type: 'project_inquiry'
      };

      try {
        await submitToWeb3Forms(form, payload);

        const successfulSubmissionTime = Date.now();

        writeSubmissionLock(
          successfulSubmissionTime
        );

        form.reset();
        resetSubmissionTracking(form);

        if (whatsAppInput) {
          whatsAppInput.readOnly = false;
        }

        if (phoneInstance) {
          phoneInstance.setCountry('pk');
        }

        if (whatsAppInstance) {
          whatsAppInstance.setCountry('pk');
        }

        if (projectSelect) {
          projectSelect.value = '';
        }

        form.dataset.startedAt = String(Date.now());

        applySubmissionLockToAllForms(
          successfulSubmissionTime,
          true
        );
      } catch (error) {
        console.error(
          'Project inquiry submission failed:',
          error
        );

        showFormStatus(
          form,
          'error',
          '<strong>We could not submit your inquiry.</strong> Please check your internet connection and try again.'
        );
      } finally {
        setSubmittingState(form, false);
      }
    });
  }

  function initializeAllProjectInquiryForms(root) {
    const searchRoot = root || document;

    if (
      searchRoot.matches &&
      searchRoot.matches('[data-project-inquiry-form]')
    ) {
      initializeProjectInquiryForm(searchRoot);
    }

    searchRoot
      .querySelectorAll('[data-project-inquiry-form]')
      .forEach(function (form) {
        initializeProjectInquiryForm(form);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      function () {
        initializeAllProjectInquiryForms(document);
      }
    );
  } else {
    initializeAllProjectInquiryForms(document);
  }

})();
