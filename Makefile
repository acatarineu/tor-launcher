### Copyright (c) 2019, The Tor Project, Inc.
### See src/LICENSE for licensing information.

# Makefile for packaging Tor Launcher outside of the browser build. The only
# target in this file that is used by the Tor Browser build process is
# import-translations.

EXT_NAME=tor-launcher
VERSION:=`grep em:version src/install.rdf | sed -e 's/[<>]/	/g' | cut -f3`
XPI_NAME:=$(shell echo "$(EXT_NAME)-$(VERSION).xpi")
STANDALONE_NAME=$(EXT_NAME)-standalone
STANDALONE_TARBALL=$(shell echo "$(STANDALONE_NAME)-$(VERSION).tar.gz")

AVAIL_TARGETS=help package standalone import-translations clean

ifeq ($(VERBOSE),1)
	ZIP=zip
	TAR=tar -v
else
	ZIP=zip -q
	TAR=tar
endif

help:
	@echo "Available targets:"; \
	for t in $(AVAIL_TARGETS); do \
		echo "  make $$t"; \
	done

pkg-prepare:	clean
	@mkdir -p pkg
	$(eval TMP="$(shell mktemp -d "/tmp/$(EXT_NAME).XXXXXX")")
	@cp -a "src" "$(TMP)/$(EXT_NAME)"
	@if [ -n "$(TL_LOGO)" ]; then \
		if [ "$(TL_LOGO)" = "-" ]; then \
			rm "$(TMP)/$(EXT_NAME)/chrome/skin/tbb-logo.png"; \
		else \
			cp -p "$(TL_LOGO)" "$(TMP)/$(EXT_NAME)/chrome/skin/tbb-logo.png"; \
		fi \
	fi
	@cp -a chrome.manifest.in "$(TMP)/$(EXT_NAME)"/chrome.manifest
	@for d in "$(TMP)/$(EXT_NAME)"/chrome/locale/*; do \
	   locale="`basename $${d}`"; \
	   if [ "$${locale}" = "en-US" ]; then \
	     continue; \
	   fi; \
	   if [ -n "$(BUNDLE_LOCALES)" ]; then \
	     if ! echo $(BUNDLE_LOCALES) | grep -qw "$${locale}"; then \
	       rm -rf "$${d}"; \
	     else \
	       echo "Including locale $${locale}"; \
	     fi \
	   fi \
	 done
	@for l in $(BUNDLE_LOCALES); do \
	   if [ ! -d "$(TMP)/$(EXT_NAME)"/chrome/locale/"$${l}" ]; then \
	     echo "Requested locale '$${l}' is missing or incomplete" >&2; \
	     exit 1; \
	   fi \
	 done
	@for d in "$(TMP)/$(EXT_NAME)"/chrome/locale/*; do \
	   locale="`basename $${d}`"; \
	   if [ "$${locale}" != "en-US" ]; then \
	     echo "locale torlauncher $${locale} chrome/locale/$${locale}/" >> \
	          "$(TMP)/$(EXT_NAME)"/chrome.manifest; \
	   fi; \
	 done

package:	pkg-prepare
	@( \
	   CURDIR="$(shell pwd)"; \
	   cd "$(TMP)/$(EXT_NAME)"; \
	   $(ZIP) -X9r "$(CURDIR)/pkg/$(XPI_NAME)" ./ -x "*.diff" \
	 )
	@rm -rf "$(TMP)"
	@echo "Created package pkg/$(XPI_NAME)"

standalone:	pkg-prepare
	@mv "$(TMP)/$(EXT_NAME)" "$(TMP)/$(STANDALONE_NAME)"
	@cp application.ini.in "$(TMP)/$(STANDALONE_NAME)/application.ini"
	@sed -i	-e "s/__VERSION__/$(VERSION)/" \
		-e "s/__DATE__/`date '+%Y%m%d'`/" \
		"$(TMP)/$(STANDALONE_NAME)/application.ini"
	@$(TAR) --exclude "*.diff" -czf "pkg/$(STANDALONE_TARBALL)" \
		-C "$(TMP)" "$(STANDALONE_NAME)"
	@rm -rf "$(TMP)"
	@echo "Created standalone package pkg/$(STANDALONE_TARBALL)"

import-translations:
	@( cd localization && ./import-translations.sh )

clean:
	@rm -f	"pkg/$(XPI_NAME)" \
		"pkg/$(STANDALONE_TARBALL)"

zip:
	@TMPFILE=/tmp/$(EXT_NAME)-`date '+%Y-%m-%d-%s'`.zip; \
	CURDIR=`pwd`; \
	BASEDIR=`basename $$CURDIR`; \
	cd ..; zip -q -r $$TMPFILE $$BASEDIR -x $$BASEDIR/build/\*; \
	rm $$TMPFILE

.PHONY: help clean zip
