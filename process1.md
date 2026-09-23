
SAO Document Tracking System 

Draft 1 Process : 

STEP : 


1 : Procurement 

  

2 : Budget 

  

3 : Supply

  

4 : Accounting 

  

5 : MCC Approval

  

6 : return Procurement 

  

7 :  COA 

  

return Supply

  

8 :  return PRE AUDIT

       ( can return to any dept if they can see a concern ) 

  

9 : accounting (Dropdown 1.) Letter 2 LDAP 3 eMDS 4 Check 

  

 9 . 5 ) If check, goes to cashier

  

( Check #, check date, check released to supplier) 

  

Accounting also will input date released to MCC input

___



___


More info about the system : 

- This system is not uploading of files though, it is not like google drive that we will upload the softcopies of the files like docx, pdfs, etc.
- This system is only used for real-time monitoring of the movement or the current state of a specific file. (So basically we need real-time updating feature here so we might need to use socket or I don't know please just provide some suggestions)
- I am still confused about the User interface but I would love to hear from you about the pages that we are going to be needing for this. 

Confused of what tech stack we need to use for this, but the goal is to deploy this to the internet, I already have a Business Web Hosting Plan in hostinger, so I think we will be good for the backend service that we will going to use for this. 

For the frontend, I want to use React JS or NextJS though, but still let me know if you have suggestions.

This is not a big system currently : 

---

Pages and Features that I already have in mind : 


Normal Users Perspective / Features:

1. Login / Register Screen
	1. Login Screen Only have Username / Email & Password to continue
	2. Register Screen 
		1. Full Name
		2. Username
		3. Email
		4. Role 
		5. Office / Designation
		6. Password
		7. Confirm Password
		8. Agree Terms and Conditions Mark Check Button (if not agreed cannot register)
 - Accounts System (Login Feature system)
2. Main Document Flow Page : 
	Depending on what kind of user/staff the currently logged in user, they can do the configurations in that specific slot/s.

	This will be like a google sheet screen with cells that can be scrolled sideways. That must be the design of this page.

	In this page they can do the entries basing on the roles they have.



Admin Perspective / Features
1. Dashboard 
	(You can put anything here that will help the admin to navigate and have a bird's eye view on what is happening in the entire system, I will give you freedom on what components will you do in this dashboard)
2. User Management Page
 - Allow/Reject Register Requests from Users
 - Block Users 
 - Authorization for Users (Users will have 'roles', so depending on what role they have as a user, the role will be the basis of the pages they can access and the configurations they can do)
 - Profile view of users
	 - Password viewing feature so that the admin can login to the normal users accounts
 
3. Roles Management
	- Admin can manage 'roles' so that each role can have the authorization privileges he/she can have
		- Roles we have : 
			- ***SAO*** (Supervising Administrative Officer) - has all the access to monitor all the pages (not configure)
			- ***Procurement Staff*** - has all the access to configure all the basic entries in the 'Procurement Department' Page ONLY
			- ***Budget Staff*** - has all the access to configure all the basic entries in the 'Budget Department' Page ONLY
			- ***Supply Staff*** - has all the access to configure all the basic entries in the 'Supply Department' Page ONLY
			- ***Pre-Audit Staff*** - has all the access to configure all the basic entries in the 'Pre-Audit Department' Page ONLY
			- ***Accounting Staff*** - has all the access to configure all the basic entries in the 'Accounting Department' Page ONLY
			- ***Cashier Staff*** - has all the access to configure all the basic entries in the 'Cashier Department' Page ONLY
			- (Note: that all staffs, can monitor other pages but CANNOT configure if they are not a staff in the specific departments. 
			  
			  Example: Budget Staff can view the changes done by Supply Staff in the Supply fields, but Budget staff can just view/monitor, cannot edit, delete, update it.)
 4. Page Management
	1. Admin can turn off, or on a page so that it cannot be accessible to others
5. Document Flow Map 
   *(**IMPORTANT**! The Map here will be the basis of what are the steps or flow of the entire document movement in the system)*
	1. The Document Flow will be based on this map and this map is generated based on the steps provided in [[process2.md]] file.
	2. However there are some instances that this process / steps needs to be reconfigured so in the Admin Panel, we must have this page with a feature to reconfigure the steps / process which will be the basis of the process flow of the system. We can use a module that looks like a map, and then the admin can just drag and drop process to reorder them or reconfigure the process of the system.
6. Audit Trail Page
	1. Admin can see the date & time stamp of each entry, and who is the specific user responsible for that specific configuration.
7. Settings 
	1. Admin settings, Change Password.
